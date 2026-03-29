use std::cell::RefCell;

use skia_safe::{
    paint,
    surfaces,
    AlphaType,
    Color,
    ColorType,
    Font,
    ImageInfo,
    Matrix,
    Paint,
    Rect,
    RRect,
    Surface,
    TextBlob,
    Typeface,
    FontMgr,
};

use crate::shared::types::{ResolvedFrame, ResolvedNode, ResolvedNodeData, ResolvedRect, ResolvedText};
use crate::color;
use crate::schema::TextAlign;

thread_local! {
    static SURFACE: RefCell<Option<Surface>> = const { RefCell::new(None) };
}

static FONT_SEARCH_PATHS: &[&str] = &[
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/SFNSText.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
    "C:\\Windows\\Fonts\\arial.ttf",
];

pub struct LoadedFont {
    typeface: Typeface,
}

pub fn load_default_font() -> Option<LoadedFont> {
    let font_manager = FontMgr::new();
    for path in FONT_SEARCH_PATHS {
        if let Ok(bytes) = std::fs::read(path) {
            if let Some(typeface) = font_manager.new_from_data(&bytes, Some(0)) {
                return Some(LoadedFont { typeface });
            }
        }
    }
    eprintln!("warning: no system font found, text will not render");
    None
}

pub fn render_frame(
    width: u32,
    height: u32,
    frame: &ResolvedFrame,
    font: Option<&LoadedFont>,
) -> Result<Vec<u8>, String> {
    SURFACE.with(|cell| {
        let mut slot = cell.borrow_mut();
        let recreate = match slot.as_ref() {
            Some(surface) => {
                surface.image_info().width() != width as i32
                    || surface.image_info().height() != height as i32
            }
            None => true,
        };
        if recreate {
            *slot = Some(
                surfaces::raster_n32_premul((width as i32, height as i32))
                    .ok_or_else(|| format!("failed to create surface {width}x{height}"))?,
            );
        }
        let Some(surface) = slot.as_mut() else {
            return Err("render surface unavailable".to_string());
        };

        let (br, bg, bb) = color::parse_hex(&frame.background);
        let canvas = surface.canvas();
        canvas.clear(Color::from_argb(255, br, bg, bb));

        for node in &frame.nodes {
            match &node.data {
                ResolvedNodeData::Rect(rect) => draw_rect(canvas, node, rect),
                ResolvedNodeData::Text(text) => {
                    if let Some(f) = font {
                        draw_text(canvas, node, text, f);
                    }
                }
            }
        }

        read_rgba_pixels(surface, width, height)
    })
}

fn apply_node_transform(canvas: &skia_safe::Canvas, node: &ResolvedNode, w: f32, h: f32) {
    let cx = w / 2.0;
    let cy = h / 2.0;
    canvas.translate((node.x as f32 + cx, node.y as f32 + cy));
    canvas.rotate(node.rotation as f32, None);
    canvas.scale((node.scale_x as f32, node.scale_y as f32));

    let skew_x = (node.skew_x as f32).to_radians().tan();
    let skew_y = (node.skew_y as f32).to_radians().tan();
    if skew_x != 0.0 || skew_y != 0.0 {
        let matrix = Matrix::new_all(1.0, skew_x, 0.0, skew_y, 1.0, 0.0, 0.0, 0.0, 1.0);
        canvas.concat(&matrix);
    }

    canvas.translate((-cx, -cy));
}

fn rounded_rect(w: f32, h: f32, r: f32) -> RRect {
    let r = r.min(w / 2.0).min(h / 2.0);
    let rect = Rect::from_xywh(0.0, 0.0, w, h);
    RRect::new_rect_xy(rect, r, r)
}

fn draw_rect(canvas: &skia_safe::Canvas, node: &ResolvedNode, rect: &ResolvedRect) {
    let w = rect.width as f32;
    let h = rect.height as f32;
    let shape = rounded_rect(w, h, rect.corner_radius as f32);
    let alpha = (255.0 * node.opacity.clamp(0.0, 1.0)) as u8;

    canvas.save();
    apply_node_transform(canvas, node, w, h);

    if let Some(ref fill_hex) = rect.fill {
        let (r, g, b) = color::parse_hex(fill_hex);
        let mut paint = Paint::default();
        paint.set_anti_alias(true);
        paint.set_style(paint::Style::Fill);
        paint.set_color(Color::from_argb(alpha, r, g, b));
        canvas.draw_rrect(shape, &paint);
    }

    if let Some(ref stroke_hex) = rect.stroke {
        if rect.stroke_width > 0.0 {
            let (r, g, b) = color::parse_hex(stroke_hex);
            let mut paint = Paint::default();
            paint.set_anti_alias(true);
            paint.set_style(paint::Style::Stroke);
            paint.set_stroke_width(rect.stroke_width as f32);
            paint.set_color(Color::from_argb(alpha, r, g, b));
            canvas.draw_rrect(shape, &paint);
        }
    }

    canvas.restore();
}

fn draw_text(canvas: &skia_safe::Canvas, node: &ResolvedNode, text: &ResolvedText, font: &LoadedFont) {
    let (cr, cg, cb) = color::parse_hex(&text.color);
    let alpha = (255.0 * node.opacity.clamp(0.0, 1.0)) as u8;
    let size = text.font_size as f32;
    let font = Font::from_typeface(font.typeface.clone(), size);
    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_style(paint::Style::Fill);
    paint.set_color(Color::from_argb(alpha, cr, cg, cb));

    canvas.save();
    apply_node_transform(canvas, node, 0.0, 0.0);

    for (line_idx, line) in text.text.split('\n').enumerate() {
        let baseline_y = line_idx as f32 * text.line_height as f32 + size;
        let line_width = measure_line(&font, line, &paint);
        let max_width = text.max_width.unwrap_or(line_width as f64) as f32;

        let line_x = match text.text_align {
            TextAlign::Left => 0.0,
            TextAlign::Center => (max_width - line_width) / 2.0,
            TextAlign::Right => max_width - line_width,
        };

        if let Some(blob) = TextBlob::from_str(line, &font) {
            canvas.draw_text_blob(&blob, (line_x, baseline_y), &paint);
        }
    }

    canvas.restore();
}

fn measure_line(font: &Font, line: &str, paint: &Paint) -> f32 {
    let (advance, _) = font.measure_str(line, Some(paint));
    advance
}

fn read_rgba_pixels(surface: &mut Surface, width: u32, height: u32) -> Result<Vec<u8>, String> {
    let info = ImageInfo::new(
        (width as i32, height as i32),
        ColorType::RGBA8888,
        AlphaType::Unpremul,
        None,
    );
    let mut pixels = vec![0_u8; (width as usize) * (height as usize) * 4];
    let row_bytes = width as usize * 4;
    if surface.read_pixels(&info, pixels.as_mut_slice(), row_bytes, (0, 0)) {
        Ok(pixels)
    } else {
        Err("failed to read surface pixels".to_string())
    }
}
