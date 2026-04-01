use skia_safe::{
    paint, surfaces, AlphaType, Color, ColorType, Font, ImageInfo, Matrix, Paint, Path, RRect,
    Rect, Surface, TextBlob,
};

use crate::icon;
use crate::schema::{LineCap, TextAlign};
use crate::shared::types::{
    ResolvedArrow, ResolvedCircle, ResolvedFrame, ResolvedLine, ResolvedNode, ResolvedNodeData,
    ResolvedRect, ResolvedText,
};
use crate::text::{self, TextMeasurer};

pub struct FrameBuffer {
    pixels: Vec<u8>,
    height: u32,
    width: u32,
}

pub trait RenderBackend {
    fn render_into(
        &mut self,
        frame: &ResolvedFrame,
        target: &mut FrameBuffer,
        measurer: &dyn TextMeasurer,
    ) -> Result<(), String>;
}

pub struct CpuSkiaBackend {
    surface: Option<Surface>,
}

impl FrameBuffer {
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            pixels: vec![0_u8; width as usize * height as usize * 4],
            height,
            width,
        }
    }

    pub fn pixels(&self) -> &[u8] {
        &self.pixels
    }

    pub fn pixels_mut(&mut self) -> &mut [u8] {
        &mut self.pixels
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }
}

impl CpuSkiaBackend {
    pub fn new() -> Self {
        Self { surface: None }
    }

    fn surface(&mut self, width: u32, height: u32) -> Result<&mut Surface, String> {
        let recreate = self.surface.as_ref().is_none_or(|surface| {
            surface.image_info().width() != width as i32
                || surface.image_info().height() != height as i32
        });
        if recreate {
            self.surface = Some(
                surfaces::raster_n32_premul((width as i32, height as i32))
                    .ok_or_else(|| format!("failed to create surface {width}x{height}"))?,
            );
        }

        self.surface
            .as_mut()
            .ok_or_else(|| "render surface unavailable".to_string())
    }
}

impl RenderBackend for CpuSkiaBackend {
    fn render_into(
        &mut self,
        frame: &ResolvedFrame,
        target: &mut FrameBuffer,
        measurer: &dyn TextMeasurer,
    ) -> Result<(), String> {
        let surface = self.surface(target.width, target.height)?;
        let (br, bg, bb) = frame.background;
        let canvas = surface.canvas();
        canvas.clear(Color::from_argb(255, br, bg, bb));

        for node in &frame.nodes {
            match &node.data {
                ResolvedNodeData::Arrow(arrow) => draw_arrow(canvas, node, arrow),
                ResolvedNodeData::Circle(circle) => draw_circle(canvas, node, circle),
                ResolvedNodeData::Icon(icon) => icon::draw_icon(canvas, node, icon),
                ResolvedNodeData::Line(line) => draw_line(canvas, node, line),
                ResolvedNodeData::Rect(rect) => draw_rect(canvas, node, rect),
                ResolvedNodeData::Text(text) => draw_text(canvas, node, text, measurer),
            }
        }

        read_rgba_pixels(surface, target)
    }
}

pub(crate) fn make_paint(alpha: u8, (r, g, b): (u8, u8, u8), style: paint::Style) -> Paint {
    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_style(style);
    paint.set_color(Color::from_argb(alpha, r, g, b));
    paint
}

pub(crate) fn apply_node_transform(
    canvas: &skia_safe::Canvas,
    node: &ResolvedNode,
    w: f32,
    h: f32,
) {
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

fn draw_arrow(canvas: &skia_safe::Canvas, node: &ResolvedNode, arrow: &ResolvedArrow) {
    let alpha = (255.0 * node.opacity.clamp(0.0, 1.0)) as u8;
    let dx = arrow.end.0 - arrow.start.0;
    let dy = arrow.end.1 - arrow.start.1;
    let length = (dx * dx + dy * dy).sqrt();

    canvas.save();
    apply_node_transform(canvas, node, arrow.width as f32, arrow.height as f32);

    if arrow.stroke_width > 0.0 {
        let mut line_paint = make_paint(alpha, arrow.stroke, paint::Style::Stroke);
        line_paint.set_stroke_width(arrow.stroke_width as f32);
        canvas.draw_line(
            (arrow.start.0 as f32, arrow.start.1 as f32),
            (arrow.end.0 as f32, arrow.end.1 as f32),
            &line_paint,
        );

        if length > f64::EPSILON {
            let ux = dx / length;
            let uy = dy / length;
            let nx = -uy;
            let ny = ux;
            let back_x = arrow.end.0 - ux * arrow.head_size;
            let back_y = arrow.end.1 - uy * arrow.head_size;
            let wing = arrow.head_size * 0.45;
            let left = (back_x + nx * wing, back_y + ny * wing);
            let right = (back_x - nx * wing, back_y - ny * wing);
            if let Some(head) = Path::from_svg(&format!(
                "M{} {} L{} {} L{} {} Z",
                arrow.end.0, arrow.end.1, left.0, left.1, right.0, right.1
            )) {
                canvas.draw_path(&head, &make_paint(alpha, arrow.stroke, paint::Style::Fill));
            }
        }
    }

    canvas.restore();
}

fn draw_circle(canvas: &skia_safe::Canvas, node: &ResolvedNode, circle: &ResolvedCircle) {
    let diameter = (circle.radius * 2.0) as f32;
    let shape = Rect::from_xywh(0.0, 0.0, diameter, diameter);
    let alpha = (255.0 * node.opacity.clamp(0.0, 1.0)) as u8;

    canvas.save();
    apply_node_transform(canvas, node, diameter, diameter);

    if let Some(fill) = circle.fill {
        canvas.draw_oval(shape, &make_paint(alpha, fill, paint::Style::Fill));
    }

    if let Some(stroke) = circle.stroke {
        if circle.stroke_width > 0.0 {
            let mut paint = make_paint(alpha, stroke, paint::Style::Stroke);
            paint.set_stroke_width(circle.stroke_width as f32);
            if circle.draw_progress < 1.0 {
                canvas.draw_arc(
                    shape,
                    270.0,
                    (360.0 * circle.draw_progress) as f32,
                    false,
                    &paint,
                );
            } else {
                canvas.draw_oval(shape, &paint);
            }
        }
    }

    canvas.restore();
}

fn draw_line(canvas: &skia_safe::Canvas, node: &ResolvedNode, line: &ResolvedLine) {
    let alpha = (255.0 * node.opacity.clamp(0.0, 1.0)) as u8;
    let dx = line.x2 - line.x1;
    let dy = line.y2 - line.y1;
    let progress = line.draw_progress.clamp(0.0, 1.0);
    let end = (line.x1 + dx * progress, line.y1 + dy * progress);

    canvas.save();
    apply_node_transform(
        canvas,
        node,
        (line.x2 - line.x1).abs() as f32,
        (line.y2 - line.y1).abs() as f32,
    );

    if line.stroke_width > 0.0 {
        let mut paint = make_paint(alpha, line.stroke, paint::Style::Stroke);
        paint.set_stroke_width(line.stroke_width as f32);
        paint.set_stroke_cap(line_cap(line.cap));
        canvas.draw_line(
            (line.x1 as f32, line.y1 as f32),
            (end.0 as f32, end.1 as f32),
            &paint,
        );
    }

    canvas.restore();
}

fn line_cap(cap: LineCap) -> paint::Cap {
    match cap {
        LineCap::Round => paint::Cap::Round,
        LineCap::Square => paint::Cap::Square,
        LineCap::Butt => paint::Cap::Butt,
    }
}

fn draw_text(
    canvas: &skia_safe::Canvas,
    node: &ResolvedNode,
    text: &ResolvedText,
    measurer: &dyn TextMeasurer,
) {
    let alpha = (255.0 * node.opacity.clamp(0.0, 1.0)) as u8;
    let Some(resolved_typeface) =
        text::resolve_typeface(text.font_family.as_deref(), measurer.default_typeface())
    else {
        return;
    };
    let measured = measurer.measure_resolved_text(text);
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

fn read_rgba_pixels(surface: &mut Surface, target: &mut FrameBuffer) -> Result<(), String> {
    let info = ImageInfo::new(
        (target.width as i32, target.height as i32),
        ColorType::RGBA8888,
        AlphaType::Unpremul,
        None,
    );
    let row_bytes = target.width as usize * 4;
    if surface.read_pixels(&info, target.pixels.as_mut_slice(), row_bytes, (0, 0)) {
        Ok(())
    } else {
        Err("failed to read surface pixels".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{CpuSkiaBackend, FrameBuffer, RenderBackend};
    use crate::schema::{IconLineCap, IconLineJoin, IconPathPrimitive, IconPrimitive, LineCap};
    use crate::shared::types::{
        ResolvedArrow, ResolvedCircle, ResolvedFrame, ResolvedIcon, ResolvedLine, ResolvedNode,
        ResolvedNodeBatchKind, ResolvedNodeData,
    };
    use crate::text::SkiaTextMeasurer;
    use crate::text::TextMeasurer;

    #[test]
    fn icon_rendering_should_paint_non_background_pixels() {
        let frame = ResolvedFrame {
            background: (255, 255, 255),
            nodes: vec![ResolvedNode {
                batch_kind: ResolvedNodeBatchKind::Dynamic,
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
            scene_cache_key: 0,
        };
        let measurer = SkiaTextMeasurer::new();
        let mut backend = CpuSkiaBackend::new();
        let mut buffer = FrameBuffer::new(48, 48);

        backend
            .render_into(&frame, &mut buffer, &measurer as &dyn TextMeasurer)
            .expect("icon frame should render");

        assert!(
            buffer
                .pixels()
                .chunks_exact(4)
                .any(|pixel| pixel[0] != 255 || pixel[1] != 255 || pixel[2] != 255),
            "expected icon rendering to change at least one pixel"
        );
    }

    #[test]
    fn arrow_rendering_should_paint_non_background_pixels() {
        let frame = ResolvedFrame {
            background: (255, 255, 255),
            nodes: vec![ResolvedNode {
                batch_kind: ResolvedNodeBatchKind::Dynamic,
                data: ResolvedNodeData::Arrow(ResolvedArrow {
                    width: 48.0,
                    height: 24.0,
                    start: (0.0, 12.0),
                    end: (48.0, 12.0),
                    stroke: (0, 0, 0),
                    stroke_width: 3.0,
                    head_size: 10.0,
                }),
                x: 0.0,
                y: 12.0,
                opacity: 1.0,
                rotation: 0.0,
                scale_x: 1.0,
                scale_y: 1.0,
                skew_x: 0.0,
                skew_y: 0.0,
                z_index: 0,
                source_index: 0,
            }],
            scene_cache_key: 0,
        };
        let measurer = SkiaTextMeasurer::new();
        let mut backend = CpuSkiaBackend::new();
        let mut buffer = FrameBuffer::new(64, 64);

        backend
            .render_into(&frame, &mut buffer, &measurer as &dyn TextMeasurer)
            .expect("arrow frame should render");

        assert!(
            buffer
                .pixels()
                .chunks_exact(4)
                .any(|pixel| pixel[0] != 255 || pixel[1] != 255 || pixel[2] != 255),
            "expected arrow rendering to change at least one pixel"
        );
    }

    #[test]
    fn circle_rendering_should_paint_non_background_pixels() {
        let frame = ResolvedFrame {
            background: (255, 255, 255),
            nodes: vec![ResolvedNode {
                batch_kind: ResolvedNodeBatchKind::Dynamic,
                data: ResolvedNodeData::Circle(ResolvedCircle {
                    radius: 20.0,
                    fill: Some((56, 189, 248)),
                    stroke: Some((15, 23, 42)),
                    stroke_width: 3.0,
                    draw_progress: 1.0,
                }),
                x: 8.0,
                y: 8.0,
                opacity: 1.0,
                rotation: 0.0,
                scale_x: 1.0,
                scale_y: 1.0,
                skew_x: 0.0,
                skew_y: 0.0,
                z_index: 0,
                source_index: 0,
            }],
            scene_cache_key: 0,
        };
        let measurer = SkiaTextMeasurer::new();
        let mut backend = CpuSkiaBackend::new();
        let mut buffer = FrameBuffer::new(64, 64);

        backend
            .render_into(&frame, &mut buffer, &measurer as &dyn TextMeasurer)
            .expect("circle frame should render");

        assert!(
            buffer
                .pixels()
                .chunks_exact(4)
                .any(|pixel| pixel[0] != 255 || pixel[1] != 255 || pixel[2] != 255),
            "expected circle rendering to change at least one pixel"
        );
    }

    #[test]
    fn line_rendering_should_paint_non_background_pixels() {
        let frame = ResolvedFrame {
            background: (255, 255, 255),
            nodes: vec![ResolvedNode {
                batch_kind: ResolvedNodeBatchKind::Dynamic,
                data: ResolvedNodeData::Line(ResolvedLine {
                    x1: 0.0,
                    y1: 0.0,
                    x2: 48.0,
                    y2: 0.0,
                    stroke: (0, 0, 0),
                    stroke_width: 4.0,
                    cap: LineCap::Round,
                    draw_progress: 1.0,
                }),
                x: 8.0,
                y: 24.0,
                opacity: 1.0,
                rotation: 0.0,
                scale_x: 1.0,
                scale_y: 1.0,
                skew_x: 0.0,
                skew_y: 0.0,
                z_index: 0,
                source_index: 0,
            }],
            scene_cache_key: 0,
        };
        let measurer = SkiaTextMeasurer::new();
        let mut backend = CpuSkiaBackend::new();
        let mut buffer = FrameBuffer::new(64, 64);

        backend
            .render_into(&frame, &mut buffer, &measurer as &dyn TextMeasurer)
            .expect("line frame should render");

        assert!(
            buffer
                .pixels()
                .chunks_exact(4)
                .any(|pixel| pixel[0] != 255 || pixel[1] != 255 || pixel[2] != 255),
            "expected line rendering to change at least one pixel"
        );
    }
}
