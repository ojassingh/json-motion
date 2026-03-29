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

    let font = text::load_default_font();

    let precomputed: Vec<animation::PrecomputedScene<'_>> = desc
        .scenes
        .iter()
        .map(|scene| animation::PrecomputedScene::new(scene, &desc))
        .collect::<Result<Vec<_>, _>>()?;

    let frames = (0..total).map(|i| {
        let frame = animation::resolve_frame_fast(&desc, i, &precomputed, font.as_ref())?;
        render::render_frame(desc.width, desc.height, &frame, font.as_ref())
    });

    eprintln!("rendering and encoding {total} frames...");

    encode::encode(
        desc.width,
        desc.height,
        desc.fps,
        &codec,
        output_path,
        frames,
    )?;

    eprintln!("done: {output_path}");

    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        process::exit(1);
    }
}
