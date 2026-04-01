pub mod animation;
pub mod color;
pub mod encode;
#[cfg(feature = "gpu")]
pub mod gpu;
pub mod icon;
pub mod layout;
pub mod parallel_encode;
pub mod render;
pub mod schema;
pub mod scene;
pub mod text;

#[cfg(test)]
mod pipeline_review_tests;

use std::env;
use std::fs;

use crate::render::RenderBackend;
use crate::text::TextMeasurer;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BackendRequest {
    Auto,
    Cpu,
    Gpu,
}

impl BackendRequest {
    pub fn from_args(args: &[String]) -> Result<Self, String> {
        let request = args
            .iter()
            .find_map(|arg| arg.strip_prefix("--backend="))
            .unwrap_or("auto");
        match request {
            "auto" => Ok(Self::Auto),
            "cpu" => Ok(Self::Cpu),
            "gpu" => Ok(Self::Gpu),
            other => Err(format!(
                "unsupported backend '{other}'; expected --backend=auto|cpu|gpu"
            )),
        }
    }

    fn wants_gpu(self) -> bool {
        !matches!(self, Self::Cpu)
    }

    fn requires_gpu(self) -> bool {
        matches!(self, Self::Gpu)
    }
}

struct EncodeRequest<'a> {
    backend: BackendRequest,
    codec: &'a str,
    output_path: &'a str,
    parallel_workers: usize,
    total_frames: usize,
}

pub fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().collect();
    if args.len() < 3 {
        return Err(
            "Usage: engine <input.json> <output.mp4> [codec] [--backend=auto|gpu|cpu]".to_string(),
        );
    }

    let input_path = &args[1];
    let output_path = &args[2];

    let backend_request = BackendRequest::from_args(&args)?;
    let parallel_workers = args
        .iter()
        .find_map(|arg| arg.strip_prefix("--parallel-workers="))
        .and_then(|value| value.parse::<usize>().ok())
        .or_else(|| {
            env::var("VIDEO_RENDER_PARALLEL_WORKERS")
                .ok()?
                .parse::<usize>()
                .ok()
        })
        .unwrap_or(1);

    let codec = args
        .get(3)
        .filter(|a| !a.starts_with("--"))
        .cloned()
        .or_else(|| env::var("VIDEO_RENDER_CODEC").ok())
        .unwrap_or_else(|| {
            if backend_request.wants_gpu() {
                encode::pick_best_h264_encoder()
            } else {
                "libx264".to_string()
            }
        });

    let json = fs::read_to_string(input_path)
        .map_err(|error| format!("failed to read {input_path}: {error}"))?;
    let desc: schema::VideoDescription =
        serde_json::from_str(&json).map_err(|error| format!("invalid scene JSON: {error}"))?;

    let total = animation::total_frame_count(&desc)?;
    eprintln!(
        "scene: {}x{} @ {}fps, {total} frames, codec={codec}",
        desc.width, desc.height, desc.fps
    );

    let measurer = text::SkiaTextMeasurer::new();
    let compiled = animation::compile_video(&desc, &measurer)?;

    eprintln!("rendering and encoding {total} frames...");

    let request = EncodeRequest {
        backend: backend_request,
        codec: &codec,
        output_path,
        parallel_workers,
        total_frames: total as usize,
    };
    let timings = run_encode(&desc, &compiled, &measurer, request)?;

    eprintln!(
        "timings: render={:.2}ms, encode={:.2}ms",
        timings.render.as_secs_f64() * 1000.0,
        timings.encode.as_secs_f64() * 1000.0
    );
    eprintln!("done: {output_path}");

    Ok(())
}

fn run_encode(
    desc: &schema::VideoDescription,
    compiled: &animation::CompiledVideo<'_>,
    measurer: &text::SkiaTextMeasurer,
    request: EncodeRequest<'_>,
) -> Result<encode::EncodeTimings, String> {
    let use_gpu = request.backend.wants_gpu();

    #[cfg(feature = "gpu")]
    if use_gpu {
        let gpu_backend = match gpu::WgpuBackend::new(desc.width, desc.height) {
            Ok(backend) => Some(backend),
            Err(error) => {
                if request.backend.requires_gpu() {
                    return Err(format!(
                        "GPU backend requested explicitly but initialization failed: {error}"
                    ));
                }
                eprintln!("GPU init failed ({error}); falling back to CPU");
                None
            }
        };
        if let Some(backend) = gpu_backend {
            eprintln!(
                "backend=gpu (wgpu), parallel_workers={}",
                request.parallel_workers
            );
            return parallel_encode::parallel_encode_wgpu(
                desc,
                compiled,
                parallel_encode::ParallelEncodeRequest {
                    codec: request.codec,
                    output_path: request.output_path,
                    frame_count: request.total_frames,
                    num_workers: request.parallel_workers,
                },
                backend,
            );
        }
    }

    #[cfg(not(feature = "gpu"))]
    if use_gpu {
        if request.backend.requires_gpu() {
            return Err(
                "GPU backend requested explicitly but engine was built without the 'gpu' feature"
                    .to_string(),
            );
        }
        eprintln!("warning: engine built without the 'gpu' feature, using CPU");
    }

    if request.parallel_workers > 1 {
        eprintln!(
            "backend=cpu (skia), parallel_workers={}",
            request.parallel_workers
        );
        return parallel_encode::parallel_encode(
            desc,
            compiled,
            measurer,
            parallel_encode::ParallelEncodeRequest {
                codec: request.codec,
                output_path: request.output_path,
                frame_count: request.total_frames,
                num_workers: request.parallel_workers,
            },
            cpu_backend_factory,
        );
    }

    eprintln!("backend=cpu (skia)");
    let mut backend = render::CpuSkiaBackend::new();
    encode::encode(
        desc.width,
        desc.height,
        desc.fps,
        request.codec,
        request.output_path,
        request.total_frames,
        |frame_index, target| {
            let frame = animation::resolve_frame_fast(compiled, frame_index as u32, measurer)?;
            backend.render_into(&frame, target, measurer as &dyn TextMeasurer)
        },
    )
}

fn cpu_backend_factory(_width: u32, _height: u32) -> Result<Box<dyn RenderBackend>, String> {
    Ok(Box::new(render::CpuSkiaBackend::new()))
}

#[cfg(test)]
mod tests {
    use super::BackendRequest;

    #[test]
    fn backend_request_should_parse_supported_values() {
        let args = vec!["engine".to_string(), "--backend=gpu".to_string()];
        assert_eq!(BackendRequest::from_args(&args), Ok(BackendRequest::Gpu));

        let args = vec!["engine".to_string(), "--backend=cpu".to_string()];
        assert_eq!(BackendRequest::from_args(&args), Ok(BackendRequest::Cpu));

        let args = vec!["engine".to_string()];
        assert_eq!(BackendRequest::from_args(&args), Ok(BackendRequest::Auto));
    }

    #[test]
    fn backend_request_should_reject_unknown_values() {
        let args = vec!["engine".to_string(), "--backend=metal".to_string()];
        let error = BackendRequest::from_args(&args).expect_err("backend should be rejected");
        assert!(error.contains("unsupported backend 'metal'"));
    }
}
