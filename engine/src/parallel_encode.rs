use std::path::{Path, PathBuf};
use std::{fs, thread};

use crate::animation::{self, CompiledVideo};
use crate::encode::{self, EncodeTimings};
use crate::render::RenderBackend;
use crate::schema::VideoDescription;
use crate::text::{SkiaTextMeasurer, TextMeasurer};

pub fn parallel_encode(
    desc: &VideoDescription,
    compiled: &CompiledVideo<'_>,
    measurer: &SkiaTextMeasurer,
    codec: &str,
    output_path: &str,
    frame_count: usize,
    num_workers: usize,
    make_backend: fn(u32, u32) -> Result<Box<dyn RenderBackend>, String>,
) -> Result<EncodeTimings, String> {
    if num_workers <= 1 || frame_count < num_workers * 2 {
        let mut backend = make_backend(desc.width, desc.height)?;
        let timings = encode::encode(
            desc.width, desc.height, desc.fps, codec, output_path, frame_count,
            |frame_index, target| {
                let frame = animation::resolve_frame_fast(compiled, frame_index as u32, measurer)?;
                backend.render_into(&frame, target, measurer as &dyn TextMeasurer)
            },
        )?;
        return Ok(timings);
    }

    let chunk_size = (frame_count + num_workers - 1) / num_workers;
    let tmp_dir = Path::new(output_path).parent().unwrap_or(Path::new("."));
    let tmp_prefix = format!(".chunk_{}", std::process::id());

    let mut chunk_files: Vec<PathBuf> = Vec::new();
    let mut ranges: Vec<(usize, usize)> = Vec::new();

    for i in 0..num_workers {
        let from = i * chunk_size;
        let to = ((i + 1) * chunk_size).min(frame_count);
        if from >= to {
            break;
        }
        let file = tmp_dir.join(format!("{tmp_prefix}_{i}.mp4"));
        chunk_files.push(file);
        ranges.push((from, to));
    }

    let width = desc.width;
    let height = desc.height;
    let fps = desc.fps;
    let codec_str = codec.to_string();

    let errors: Vec<Result<EncodeTimings, String>> = thread::scope(|scope| {
        let handles: Vec<_> = ranges
            .iter()
            .zip(chunk_files.iter())
            .map(|(&(from, to), path)| {
                let codec_ref = &codec_str;
                let path_str = path.to_str().unwrap().to_string();
                scope.spawn(move || {
                    let local_measurer = SkiaTextMeasurer::new();
                    let mut backend = make_backend(width, height)?;

                    encode::encode(
                        width, height, fps, codec_ref, &path_str,
                        to - from,
                        |local_index, target| {
                            let global_index = from + local_index;
                            let frame = animation::resolve_frame_fast(
                                compiled, global_index as u32, &local_measurer,
                            )?;
                            backend.render_into(&frame, target, &local_measurer as &dyn TextMeasurer)
                        },
                    )
                })
            })
            .collect();

        handles.into_iter().map(|h| h.join().unwrap()).collect()
    });

    let mut render = EncodeTimings {
        render: std::time::Duration::ZERO,
        encode: std::time::Duration::ZERO,
    };
    for result in errors {
        let timings = result?;
        render.render += timings.render;
        render.encode += timings.encode;
    }

    concat_segments(&chunk_files, output_path, codec)?;

    for f in &chunk_files {
        let _ = fs::remove_file(f);
    }

    Ok(render)
}

fn concat_segments(segments: &[PathBuf], output: &str, codec: &str) -> Result<(), String> {
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

    let status = std::process::Command::new("ffmpeg")
        .args([
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            list_path.to_str().unwrap(),
            "-c:v",
            codec,
            output,
        ])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| format!("failed to run ffmpeg concat: {e}"))?;

    let _ = fs::remove_file(&list_path);

    if status.success() {
        Ok(())
    } else {
        Err(format!("ffmpeg concat exited with {status}"))
    }
}
