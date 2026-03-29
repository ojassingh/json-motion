mod animation;
mod color;
mod encode;
mod layout;
mod shared;
mod render;
mod schema;

use rayon::prelude::*;
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

    let total = animation::total_frame_count(&desc);
    eprintln!(
        "scene: {}x{} @ {}fps, {total} frames, codec={codec}",
        desc.width, desc.height, desc.fps
    );

    let font = render::load_default_font();

    let precomputed: Vec<animation::PrecomputedScene<'_>> = desc
        .scenes
        .iter()
        .map(|scene| animation::PrecomputedScene::new(scene, &desc))
        .collect();

    let frames: Result<Vec<Vec<u8>>, String> = (0..total)
        .into_par_iter()
        .map(|i| {
            let frame = animation::resolve_frame_fast(&desc, i, &precomputed);
            render::render_frame(desc.width, desc.height, &frame, font.as_ref())
        })
        .collect();
    let frames = frames?;

    eprintln!("rendered {total} frames, encoding...");

    encode::encode(
        desc.width,
        desc.height,
        desc.fps,
        &codec,
        output_path,
        frames.into_iter(),
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
