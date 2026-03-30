mod animation;
mod color;
mod encode;
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

fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().collect();
    if args.len() < 3 {
        return Err("Usage: engine <input.json> <output.mp4> [codec]".to_string());
    }

    let input_path = &args[1];
    let output_path = &args[2];
    let codec = args
        .get(3)
        .cloned()
        .or_else(|| env::var("VIDEO_RENDER_CODEC").ok())
        .unwrap_or_else(|| "libx264".to_string());

    let json = fs::read_to_string(input_path).map_err(|error| format!("failed to read {input_path}: {error}"))?;
    let desc: schema::VideoDescription =
        serde_json::from_str(&json).map_err(|error| format!("invalid scene JSON: {error}"))?;

    let total = animation::total_frame_count(&desc)?;
    eprintln!(
        "scene: {}x{} @ {}fps, {total} frames, codec={codec}",
        desc.width, desc.height, desc.fps
    );

    let measurer = text::SkiaTextMeasurer::new();
    let compiled = animation::compile_video(&desc, &measurer)?;
    let mut backend = render::CpuSkiaBackend::new();

    eprintln!("rendering and encoding {total} frames...");

    let timings = encode::encode(
        desc.width,
        desc.height,
        desc.fps,
        &codec,
        output_path,
        total as usize,
        |frame_index, target| {
            let frame = animation::resolve_frame_fast(&compiled, frame_index as u32, &measurer)?;
            backend.render_into(&frame, target, &measurer)
        },
    )?;

    eprintln!(
        "timings: render={:.2}ms, encode={:.2}ms",
        timings.render.as_secs_f64() * 1000.0,
        timings.encode.as_secs_f64() * 1000.0
    );
    eprintln!("done: {output_path}");

    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        process::exit(1);
    }
}
