use std::path::{Path, PathBuf};
#[cfg(feature = "gpu")]
use std::sync::{mpsc, Arc};
use std::time::Instant;
use std::{fs, thread};

use crate::animation::{self, CompiledVideo};
use crate::encode::{self, EncodeTimings};
#[cfg(feature = "gpu")]
use crate::gpu::WgpuBackend;
use crate::render::RenderBackend;
use crate::schema::VideoDescription;
use crate::text::{SkiaTextMeasurer, TextMeasurer};

#[derive(Clone, Copy)]
pub struct ParallelEncodeRequest<'a> {
    pub codec: &'a str,
    pub frame_count: usize,
    pub num_workers: usize,
    pub output_path: &'a str,
}

struct ChunkSegment {
    path: PathBuf,
    range: std::ops::Range<usize>,
}

fn build_chunk_segments(request: &ParallelEncodeRequest<'_>) -> Vec<ChunkSegment> {
    let chunk_size = request.frame_count.div_ceil(request.num_workers);
    let tmp_dir = Path::new(request.output_path)
        .parent()
        .unwrap_or(Path::new("."));
    let tmp_prefix = format!(".chunk_{}", std::process::id());
    let mut segments = Vec::new();

    for index in 0..request.num_workers {
        let start = index * chunk_size;
        let end = ((index + 1) * chunk_size).min(request.frame_count);
        if start >= end {
            break;
        }

        segments.push(ChunkSegment {
            path: tmp_dir.join(format!("{tmp_prefix}_{index}.mkv")),
            range: start..end,
        });
    }

    segments
}

#[cfg(feature = "gpu")]
enum WorkerFrame {
    Owned(crate::render::FrameBuffer),
    Shared(Arc<[u8]>),
}

#[cfg(feature = "gpu")]
enum WorkerMessage {
    Finish,
    Frame { local_index: usize, pixels: WorkerFrame },
}

#[cfg(feature = "gpu")]
struct SubmittedFrame {
    chunk_index: usize,
    hint: animation::frame::FrameRenderHint,
    local_index: usize,
}

#[cfg(feature = "gpu")]
fn recycle_framebuffer(
    sender: &mpsc::SyncSender<crate::render::FrameBuffer>,
    buffer: crate::render::FrameBuffer,
) -> Result<(), String> {
    sender
        .send(buffer)
        .map_err(|_| "framebuffer recycle channel closed".to_string())
}

#[cfg(feature = "gpu")]
fn worker_channel_error(
    error_receiver: &mpsc::Receiver<String>,
    fallback: &str,
) -> String {
    error_receiver
        .try_recv()
        .unwrap_or_else(|_| fallback.to_string())
}

#[cfg(feature = "gpu")]
fn encode_chunk_worker(
    width: u32,
    height: u32,
    fps: f64,
    codec: &str,
    output_path: &str,
    receiver: mpsc::Receiver<WorkerMessage>,
    recycle_sender: mpsc::SyncSender<crate::render::FrameBuffer>,
) -> Result<(), String> {
    let mut encoder = encode::RgbaVideoEncoder::new(width, height, fps, codec, output_path)?;
    while let Ok(message) = receiver.recv() {
        match message {
            WorkerMessage::Finish => break,
            WorkerMessage::Frame { local_index, pixels } => match pixels {
                WorkerFrame::Owned(buffer) => {
                    encoder.encode_rgba_pixels(buffer.pixels(), local_index as i64)?;
                    recycle_framebuffer(&recycle_sender, buffer)?;
                }
                WorkerFrame::Shared(pixels) => {
                    encoder.encode_rgba_pixels(&pixels, local_index as i64)?;
                }
            },
        }
    }

    encoder.finish()
}

pub fn parallel_encode(
    desc: &VideoDescription,
    compiled: &CompiledVideo<'_>,
    measurer: &SkiaTextMeasurer,
    request: ParallelEncodeRequest<'_>,
    make_backend: fn(u32, u32) -> Result<Box<dyn RenderBackend>, String>,
) -> Result<EncodeTimings, String> {
    if request.num_workers <= 1 || request.frame_count < request.num_workers * 2 {
        let mut backend = make_backend(desc.width, desc.height)?;
        let timings = encode::encode(
            desc.width,
            desc.height,
            desc.fps,
            request.codec,
            request.output_path,
            request.frame_count,
            |frame_index, target| {
                let frame = animation::resolve_frame_fast(compiled, frame_index as u32, measurer)?;
                backend.render_into(&frame, target, measurer as &dyn TextMeasurer)
            },
        )?;
        return Ok(timings);
    }

    let segments = build_chunk_segments(&request);
    let chunk_files = segments.iter().map(|segment| segment.path.clone()).collect::<Vec<_>>();

    let width = desc.width;
    let height = desc.height;
    let fps = desc.fps;
    let codec_str = request.codec.to_string();

    let processing_started = Instant::now();
    let errors: Vec<Result<EncodeTimings, String>> = thread::scope(|scope| {
        let handles: Vec<_> = segments
            .iter()
            .map(|segment| {
                let codec_ref = &codec_str;
                let from = segment.range.start;
                let to = segment.range.end;
                let path_str = segment.path.to_string_lossy().to_string();
                scope.spawn(move || {
                    let local_measurer = SkiaTextMeasurer::new();
                    let mut backend = make_backend(width, height)?;

                    encode::encode(
                        width,
                        height,
                        fps,
                        codec_ref,
                        &path_str,
                        to - from,
                        |local_index, target| {
                            let global_index = from + local_index;
                            let frame = animation::resolve_frame_fast(
                                compiled,
                                global_index as u32,
                                &local_measurer,
                            )?;
                            backend.render_into(
                                &frame,
                                target,
                                &local_measurer as &dyn TextMeasurer,
                            )
                        },
                    )
                })
            })
            .collect();

        handles
            .into_iter()
            .map(|handle| {
                handle
                    .join()
                    .map_err(|_| "parallel encode worker panicked".to_string())?
            })
            .collect()
    });
    let chunk_processing_elapsed = processing_started.elapsed();

    for result in errors {
        result?;
    }

    let concat_started = Instant::now();
    let concat_result = concat_segments(&chunk_files, request.output_path);
    let concat_elapsed = concat_started.elapsed();

    cleanup_files(&chunk_files);
    concat_result?;

    Ok(EncodeTimings {
        render: chunk_processing_elapsed,
        encode: concat_elapsed,
    })
}

#[cfg(feature = "gpu")]
pub fn parallel_encode_wgpu(
    desc: &VideoDescription,
    compiled: &CompiledVideo<'_>,
    request: ParallelEncodeRequest<'_>,
) -> Result<EncodeTimings, String> {
    let worker_count = request.num_workers.max(1).min(request.frame_count.max(1));
    let effective_request = ParallelEncodeRequest {
        num_workers: worker_count,
        ..request
    };
    let segments = build_chunk_segments(&effective_request);
    let chunk_files = segments.iter().map(|segment| segment.path.clone()).collect::<Vec<_>>();

    let width = desc.width;
    let height = desc.height;
    let fps = desc.fps;
    let codec_str = request.codec.to_string();
    let encode_started = Instant::now();
    let processing_result = thread::scope(|scope| -> Result<EncodeTimings, String> {
        let buffer_capacity = (segments.len() * 2).max(4);
        let (recycle_sender, recycle_receiver) =
            mpsc::sync_channel::<crate::render::FrameBuffer>(buffer_capacity);
        let (worker_error_sender, worker_error_receiver) = mpsc::channel::<String>();
        for _ in 0..buffer_capacity {
            recycle_sender
                .send(crate::render::FrameBuffer::new(width, height))
                .map_err(|_| "failed to seed framebuffer pool".to_string())?;
        }

        let mut worker_senders = Vec::with_capacity(segments.len());
        let worker_handles = segments
            .iter()
            .map(|segment| {
                let (sender, receiver) = mpsc::sync_channel::<WorkerMessage>(2);
                worker_senders.push(sender);
                let recycle_sender = recycle_sender.clone();
                let worker_error_sender = worker_error_sender.clone();
                let codec_ref = &codec_str;
                let output_path = segment.path.to_string_lossy().to_string();
                scope.spawn(move || {
                    let result = encode_chunk_worker(
                        width,
                        height,
                        fps,
                        codec_ref,
                        &output_path,
                        receiver,
                        recycle_sender,
                    );
                    if let Err(error) = &result {
                        let _ = worker_error_sender.send(error.clone());
                    }
                    result
                })
            })
            .collect::<Vec<_>>();

        let local_measurer = SkiaTextMeasurer::new();
        let mut backend = WgpuBackend::new(width, height)?;
        let producer_started = Instant::now();
        let mut inflight_frames = std::collections::VecDeque::new();
        let mut dispatched_frames = 0usize;
        let mut next_frame = 0usize;
        let mut next_chunk_index = 0usize;
        let mut pending_static_scene = None;
        let mut static_scene_pixels: Option<(u64, Arc<[u8]>)> = None;

        while dispatched_frames < request.frame_count {
            while next_frame < request.frame_count && backend.can_accept_frame() {
                while next_chunk_index + 1 < segments.len()
                    && next_frame >= segments[next_chunk_index].range.end
                {
                    next_chunk_index += 1;
                }

                let hint = animation::frame_render_hint(compiled, next_frame as u32);
                let local_index = next_frame - segments[next_chunk_index].range.start;

                if let Some((scene_key, pixels)) = &static_scene_pixels {
                    if *scene_key == hint.scene_cache_key && hint.can_reuse_rendered_frame {
                        worker_senders[next_chunk_index]
                            .send(WorkerMessage::Frame {
                                local_index,
                                pixels: WorkerFrame::Shared(Arc::clone(pixels)),
                            })
                            .map_err(|_| {
                                worker_channel_error(
                                    &worker_error_receiver,
                                    "GPU encode worker channel closed",
                                )
                            })?;
                        next_frame += 1;
                        dispatched_frames += 1;
                        continue;
                    }
                }

                if pending_static_scene == Some(hint.scene_cache_key) {
                    break;
                }

                let frame =
                    animation::resolve_frame_fast(compiled, next_frame as u32, &local_measurer)?;
                backend.submit_frame(&frame, &local_measurer as &dyn TextMeasurer)?;
                inflight_frames.push_back(SubmittedFrame {
                    chunk_index: next_chunk_index,
                    hint,
                    local_index,
                });
                if hint.can_reuse_rendered_frame {
                    pending_static_scene = Some(hint.scene_cache_key);
                    static_scene_pixels = None;
                }
                next_frame += 1;
            }

            let Some(submitted) = inflight_frames.pop_front() else {
                continue;
            };

            let mut buffer = recycle_receiver
                .recv()
                .map_err(|_| "framebuffer pool channel closed".to_string())?;
            backend.collect_frame(&mut buffer)?;

            if submitted.hint.can_reuse_rendered_frame {
                let pixels = Arc::<[u8]>::from(buffer.pixels().to_vec());
                static_scene_pixels = Some((submitted.hint.scene_cache_key, Arc::clone(&pixels)));
                pending_static_scene = None;
                recycle_framebuffer(&recycle_sender, buffer)?;
                worker_senders[submitted.chunk_index]
                    .send(WorkerMessage::Frame {
                        local_index: submitted.local_index,
                        pixels: WorkerFrame::Shared(pixels),
                    })
                    .map_err(|_| {
                        worker_channel_error(
                            &worker_error_receiver,
                            "GPU encode worker channel closed",
                        )
                    })?;
            } else {
                worker_senders[submitted.chunk_index]
                    .send(WorkerMessage::Frame {
                        local_index: submitted.local_index,
                        pixels: WorkerFrame::Owned(buffer),
                    })
                    .map_err(|_| {
                        worker_channel_error(
                            &worker_error_receiver,
                            "GPU encode worker channel closed",
                        )
                    })?;
            }

            dispatched_frames += 1;
        }

        let render_elapsed = producer_started.elapsed();
        for sender in worker_senders {
            sender
                .send(WorkerMessage::Finish)
                .map_err(|_| {
                    worker_channel_error(&worker_error_receiver, "GPU encode worker channel closed")
                })?;
        }
        for handle in worker_handles {
            handle
                .join()
                .map_err(|_| "GPU encode worker panicked".to_string())??;
        }
        Ok(EncodeTimings {
            render: render_elapsed,
            encode: encode_started.elapsed(),
        })
    })?;

    let chunk_processing_elapsed = processing_result.encode;

    let concat_started = Instant::now();
    let concat_result = concat_segments(&chunk_files, request.output_path);
    let concat_elapsed = concat_started.elapsed();

    cleanup_files(&chunk_files);
    concat_result?;

    Ok(EncodeTimings {
        render: processing_result.render,
        encode: chunk_processing_elapsed + concat_elapsed,
    })
}

fn cleanup_files(paths: &[PathBuf]) {
    for path in paths {
        let _ = fs::remove_file(path);
    }
}

fn concat_segments(segments: &[PathBuf], output: &str) -> Result<(), String> {
    let list_path = Path::new(output)
        .parent()
        .unwrap_or(Path::new("."))
        .join(format!(".concat_{}.txt", std::process::id()));

    let list_content: String = segments
        .iter()
        .map(|p| {
            let absolute = fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf());
            format!("file '{}'\n", absolute.display())
        })
        .collect();

    fs::write(&list_path, &list_content)
        .map_err(|e| format!("failed to write concat list: {e}"))?;

    let output_result = std::process::Command::new("ffmpeg")
        .args(concat_command_args(&list_path, output))
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("failed to run ffmpeg concat: {e}"))?;

    let _ = fs::remove_file(&list_path);

    if output_result.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output_result.stderr);
        Err(format!(
            "ffmpeg concat exited with {}: {}",
            output_result.status,
            stderr.trim()
        ))
    }
}

fn concat_command_args<'a>(list_path: &'a Path, output: &'a str) -> [&'a str; 10] {
    [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        list_path.to_str().unwrap(),
        "-c",
        "copy",
        output,
    ]
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::concat_command_args;

    #[test]
    fn concat_command_should_stream_copy_segments() {
        let args = concat_command_args(Path::new("/tmp/segments.txt"), "/tmp/out.mp4");
        assert!(args.contains(&"-c"));
        assert!(args.contains(&"copy"));
    }
}
