mod animation;
mod color;
mod encode;
#[cfg(feature = "gpu")]
mod gpu;
mod icon;
mod layout;
mod render;
mod schema;
mod shared;
mod text;

#[cfg(test)]
mod pipeline_review_tests;

use std::env;
use std::fs;
use std::process;

use crate::render::RenderBackend;
use crate::text::TextMeasurer;

fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().collect();
    if args.len() < 3 {
        return Err("Usage: engine <input.json> <output.mp4> [codec] [--backend=gpu|cpu]".to_string());
    }

    let input_path = &args[1];
    let output_path = &args[2];

    let force_cpu = args.iter().any(|a| a == "--backend=cpu");
    let use_gpu = !force_cpu && (cfg!(feature = "gpu") || args.iter().any(|a| a == "--backend=gpu"));

    let codec = args
        .get(3)
        .filter(|a| !a.starts_with("--"))
        .cloned()
        .or_else(|| env::var("VIDEO_RENDER_CODEC").ok())
        .unwrap_or_else(|| {
            if use_gpu {
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

    let timings = run_encode(
        &desc, &compiled, &measurer, &codec, output_path,
        total as usize, use_gpu,
    )?;

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
    codec: &str,
    output_path: &str,
    total: usize,
    use_gpu: bool,
) -> Result<encode::EncodeTimings, String> {
    #[cfg(feature = "gpu")]
    if use_gpu {
        match gpu::WgpuBackend::new(desc.width, desc.height) {
            Ok(mut backend) => {
                eprintln!("backend=gpu (wgpu)");
                return encode::encode(
                    desc.width, desc.height, desc.fps, codec, output_path, total,
                    |frame_index, target| {
                        let frame = animation::resolve_frame_fast(
                            compiled, frame_index as u32, measurer,
                        )?;
                        backend.render_into(&frame, target, measurer as &dyn TextMeasurer)
                    },
                );
            }
            Err(e) => {
                eprintln!("GPU init failed ({e}); falling back to CPU");
            }
        }
    }

    #[cfg(not(feature = "gpu"))]
    if use_gpu {
        eprintln!("warning: engine built without the 'gpu' feature, using CPU");
    }

    eprintln!("backend=cpu (skia)");
    let mut backend = render::CpuSkiaBackend::new();
    encode::encode(
        desc.width, desc.height, desc.fps, codec, output_path, total,
        |frame_index, target| {
            let frame = animation::resolve_frame_fast(compiled, frame_index as u32, measurer)?;
            backend.render_into(&frame, target, measurer as &dyn TextMeasurer)
        },
    )
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        process::exit(1);
    }
}
