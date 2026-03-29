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
};

use crate::icon;
use crate::schema::TextAlign;
use crate::shared::types::{ResolvedFrame, ResolvedNode, ResolvedNodeData, ResolvedRect, ResolvedText};
use crate::text;

thread_local! {
    static SURFACE: RefCell<Option<Surface>> = const { RefCell::new(None) };
}

pub fn render_frame(
    width: u32,
    height: u32,
    frame: &ResolvedFrame,
    font: Option<&Typeface>,
) -> Result<Vec<u8>, String> {
    SURFACE.with(|cell| {
        let mut slot = cell.borrow_mut();
        let recreate = slot.as_ref().is_none_or(|s| {
            s.image_info().width() != width as i32 || s.image_info().height() != height as i32
        });
        if recreate {
            *slot = Some(
                surfaces::raster_n32_premul((width as i32, height as i32))
                    .ok_or_else(|| format!("failed to create surface {width}x{height}"))?,
            );
        }
        let Some(surface) = slot.as_mut() else {
            return Err("render surface unavailable".to_string());
        };

        let (br, bg, bb) = frame.background;
        let canvas = surface.canvas();
        canvas.clear(Color::from_argb(255, br, bg, bb));

        for node in &frame.nodes {
            match &node.data {
                ResolvedNodeData::Icon(icon) => icon::draw_icon(canvas, node, icon),
                ResolvedNodeData::Rect(rect) => draw_rect(canvas, node, rect),
                ResolvedNodeData::Text(text) => {
                    if let Some(typeface) = font {
                        draw_text(canvas, node, text, typeface);
                    }
                }
            }
        }

        read_rgba_pixels(surface, width, height)
    })
}

pub(crate) fn make_paint(alpha: u8, (r, g, b): (u8, u8, u8), style: paint::Style) -> Paint {
    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_style(style);
    paint.set_color(Color::from_argb(alpha, r, g, b));
    paint
}

pub(crate) fn apply_node_transform(canvas: &skia_safe::Canvas, node: &ResolvedNode, w: f32, h: f32) {
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

fn draw_rect(canvas: &skia_safe::Canvas, node: &ResolvedNode, rect: &ResolvedRect) {
    let w = rect.width as f32;
    let h = rect.height as f32;
    let r = (rect.corner_radius as f32).min(w / 2.0).min(h / 2.0);
    let shape = RRect::new_rect_xy(Rect::from_xywh(0.0, 0.0, w, h), r, r);
    let alpha = (255.0 * node.opacity.clamp(0.0, 1.0)) as u8;

    canvas.save();
    apply_node_transform(canvas, node, w, h);

    if let Some(fill) = rect.fill {
        canvas.draw_rrect(shape, &make_paint(alpha, fill, paint::Style::Fill));
    }

    if let Some(stroke) = rect.stroke {
        if rect.stroke_width > 0.0 {
            let mut paint = make_paint(alpha, stroke, paint::Style::Stroke);
            paint.set_stroke_width(rect.stroke_width as f32);
            canvas.draw_rrect(shape, &paint);
        }
    }

    canvas.restore();
}

fn draw_text(canvas: &skia_safe::Canvas, node: &ResolvedNode, text: &ResolvedText, typeface: &Typeface) {
    let alpha = (255.0 * node.opacity.clamp(0.0, 1.0)) as u8;
    let Some(resolved_typeface) = text::resolve_typeface(text.font_family.as_deref(), Some(typeface)) else {
        return;
    };
    let measured = text::measure_resolved_text(text, Some(&resolved_typeface));
    let font = Font::from_typeface(resolved_typeface, text.font_size as f32);
    let paint = make_paint(alpha, text.color, paint::Style::Fill);
    let container_width = measured.width as f32;

    canvas.save();
    apply_node_transform(canvas, node, 0.0, 0.0);

    for (line_idx, line) in text.text.split('\n').enumerate() {
        let metrics = &measured.lines[line_idx];
        let baseline_y = measured.baseline_offset + line_idx as f32 * text.line_height as f32;

        let line_x = match text.text_align {
            TextAlign::Left => -metrics.left,
            TextAlign::Center => (container_width - metrics.width) / 2.0 - metrics.left,
            TextAlign::Right => container_width - metrics.width - metrics.left,
        }
        .round();

        if let Some(blob) = TextBlob::from_str(line, &font) {
            canvas.draw_text_blob(&blob, (line_x, baseline_y), &paint);
        }
    }

    canvas.restore();
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

#[cfg(test)]
mod tests {
    use super::render_frame;
    use crate::schema::{IconLineCap, IconLineJoin, IconPathPrimitive, IconPrimitive};
    use crate::shared::types::{ResolvedFrame, ResolvedIcon, ResolvedNode, ResolvedNodeData};

    #[test]
    fn icon_rendering_should_paint_non_background_pixels() {
        let frame = ResolvedFrame {
            background: (255, 255, 255),
            nodes: vec![ResolvedNode {
                data: ResolvedNodeData::Icon(ResolvedIcon {
                    width: 48.0,
                    height: 48.0,
                    viewport_width: 24.0,
                    viewport_height: 24.0,
                    stroke: (0, 0, 0),
                    fill: None,
                    stroke_width: 2.0,
                    absolute_stroke_width: false,
                    line_cap: IconLineCap::Round,
                    line_join: IconLineJoin::Round,
                    elements: vec![
                        IconPrimitive::Path(IconPathPrimitive {
                            d: "M5 12h14".to_string(),
                        }),
                        IconPrimitive::Path(IconPathPrimitive {
                            d: "m12 5 7 7-7 7".to_string(),
                        }),
                    ],
                }),
                x: 0.0,
                y: 0.0,
                opacity: 1.0,
                rotation: 0.0,
                scale_x: 1.0,
                scale_y: 1.0,
                skew_x: 0.0,
                skew_y: 0.0,
                z_index: 0,
                source_index: 0,
            }],
        };

        let pixels = render_frame(48, 48, &frame, None).expect("icon frame should render");
        assert!(
            pixels
                .chunks_exact(4)
                .any(|pixel| pixel[0] != 255 || pixel[1] != 255 || pixel[2] != 255),
            "expected icon rendering to change at least one pixel"
        );
    }
}
