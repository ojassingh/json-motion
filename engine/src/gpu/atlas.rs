use std::collections::HashMap;

use skia_safe::{
    surfaces, AlphaType, Color, ColorType, Font, ImageInfo, Paint, TextBlob, paint,
};

use crate::schema::TextAlign;
use crate::shared::types::{ResolvedNode, ResolvedText};
use crate::text::{self, TextMeasurer};

pub struct GlyphRegion {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

pub struct TextLineEntry {
    pub region: GlyphRegion,
    pub world_x: f32,
    pub world_y: f32,
}

pub struct TextNodeEntry {
    pub lines: Vec<TextLineEntry>,
    pub node_idx: usize,
}

pub struct AtlasBuild {
    pub pixels: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub entries: Vec<TextNodeEntry>,
}

const ATLAS_MAX_WIDTH: u32 = 4096;
const PADDING: u32 = 2;

pub fn build_text_atlas(
    nodes: &[(usize, &ResolvedNode, &ResolvedText)],
    measurer: &dyn TextMeasurer,
) -> Option<AtlasBuild> {
    if nodes.is_empty() {
        return None;
    }

    let mut line_rasters: Vec<LineRaster> = Vec::new();

    for &(node_idx, node, text) in nodes {
        let measured = measurer.measure_resolved_text(text);
        let typeface = text::resolve_typeface(
            text.font_family.as_deref(),
            measurer.default_typeface(),
        );
        let Some(typeface) = typeface else { continue };

        let font = Font::from_typeface(typeface, text.font_size as f32);
        let container_width = measured.width as f32;

        for (line_idx, line_str) in text.text.split('\n').enumerate() {
            if line_str.is_empty() {
                continue;
            }
            let metrics = &measured.lines[line_idx];
            let baseline_y =
                measured.baseline_offset + line_idx as f32 * text.line_height as f32;

            let line_x = match text.text_align {
                TextAlign::Left => -metrics.left,
                TextAlign::Center => {
                    (container_width - metrics.width) / 2.0 - metrics.left
                }
                TextAlign::Right => container_width - metrics.width - metrics.left,
            }
            .round();

            let blob = match TextBlob::from_str(line_str, &font) {
                Some(b) => b,
                None => continue,
            };

            let bounds_left = blob.bounds().left;
            let bounds_top = blob.bounds().top;
            let bounds_w = blob.bounds().width();
            let bounds_h = blob.bounds().height();

            let w = bounds_w.ceil() as u32 + 2;
            let h = bounds_h.ceil() as u32 + 2;
            if w == 0 || h == 0 {
                continue;
            }

            let draw_x = -bounds_left + 1.0;
            let draw_y = -bounds_top + 1.0;

            line_rasters.push(LineRaster {
                node_idx,
                blob,
                w,
                h,
                draw_x,
                draw_y,
                world_x: node.x as f32 + line_x,
                world_y: node.y as f32 + baseline_y + bounds_top - 1.0,
            });
        }
    }

    if line_rasters.is_empty() {
        return None;
    }

    let (atlas_w, atlas_h, placements) = pack_rects(&line_rasters);

    let info = ImageInfo::new(
        (atlas_w as i32, atlas_h as i32),
        ColorType::Alpha8,
        AlphaType::Premul,
        None,
    );
    let mut surface = surfaces::raster(&info, atlas_w as usize, None)?;
    let canvas = surface.canvas();
    canvas.clear(Color::TRANSPARENT);

    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_style(paint::Style::Fill);
    paint.set_color(Color::WHITE);

    let mut entries_map: HashMap<usize, Vec<TextLineEntry>> = HashMap::new();

    for (i, lr) in line_rasters.iter().enumerate() {
        let (px, py) = placements[i];
        canvas.draw_text_blob(&lr.blob, (px as f32 + lr.draw_x, py as f32 + lr.draw_y), &paint);

        entries_map
            .entry(lr.node_idx)
            .or_default()
            .push(TextLineEntry {
                region: GlyphRegion {
                    x: px,
                    y: py,
                    w: lr.w,
                    h: lr.h,
                },
                world_x: lr.world_x,
                world_y: lr.world_y,
            });
    }

    let row_bytes = atlas_w as usize;
    let mut pixels = vec![0u8; row_bytes * atlas_h as usize];
    let read_info = ImageInfo::new(
        (atlas_w as i32, atlas_h as i32),
        ColorType::Alpha8,
        AlphaType::Premul,
        None,
    );
    surface.read_pixels(&read_info, &mut pixels, row_bytes, (0, 0));

    let entries: Vec<TextNodeEntry> = entries_map
        .into_iter()
        .map(|(node_idx, lines)| TextNodeEntry { node_idx, lines })
        .collect();

    Some(AtlasBuild {
        pixels,
        width: atlas_w,
        height: atlas_h,
        entries,
    })
}

struct LineRaster {
    node_idx: usize,
    blob: TextBlob,
    w: u32,
    h: u32,
    draw_x: f32,
    draw_y: f32,
    world_x: f32,
    world_y: f32,
}

fn pack_rects(rasters: &[LineRaster]) -> (u32, u32, Vec<(u32, u32)>) {
    let mut cursor_x: u32 = 0;
    let mut cursor_y: u32 = 0;
    let mut row_height: u32 = 0;
    let mut atlas_w: u32 = 0;
    let mut atlas_h: u32 = 0;
    let mut placements = Vec::with_capacity(rasters.len());

    for lr in rasters {
        if cursor_x + lr.w + PADDING > ATLAS_MAX_WIDTH {
            cursor_y += row_height + PADDING;
            cursor_x = 0;
            row_height = 0;
        }
        placements.push((cursor_x, cursor_y));
        atlas_w = atlas_w.max(cursor_x + lr.w);
        row_height = row_height.max(lr.h);
        atlas_h = atlas_h.max(cursor_y + lr.h);
        cursor_x += lr.w + PADDING;
    }

    let atlas_w = atlas_w.next_power_of_two().max(1);
    let atlas_h = atlas_h.next_power_of_two().max(1);

    (atlas_w, atlas_h, placements)
}
