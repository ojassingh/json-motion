use skia_safe::{
    paint, surfaces, AlphaType, Color, ColorType, Font, ImageInfo, Matrix, Paint, Path,
    PathBuilder, RRect, Rect, Surface, TextBlob,
};

use crate::icon;
use crate::schema::TextAlign;
use crate::shared::types::{
    ResolvedArrow, ResolvedFrame, ResolvedFunctionGraph, ResolvedNode, ResolvedNodeData,
    ResolvedParametricGraph, ResolvedRect, ResolvedText,
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
                ResolvedNodeData::FunctionGraph(graph) => draw_function_graph(canvas, node, graph),
                ResolvedNodeData::Icon(icon) => icon::draw_icon(canvas, node, icon),
                ResolvedNodeData::ParametricGraph(graph) => {
                    draw_parametric_graph(canvas, node, graph)
                }
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

fn muted_color((r, g, b): (u8, u8, u8), factor: f32) -> (u8, u8, u8) {
    (
        (r as f32 * factor).round() as u8,
        (g as f32 * factor).round() as u8,
        (b as f32 * factor).round() as u8,
    )
}

fn path_from_points(points: &[(f64, f64)], draw_progress: f64) -> Option<Path> {
    let count = ((points.len() as f64) * draw_progress.clamp(0.0, 1.0)).floor() as usize;
    if count < 2 {
        return None;
    }

    let mut path = PathBuilder::new();
    let (start_x, start_y) = points[0];
    path.move_to((start_x as f32, start_y as f32));

    for &(x, y) in points.iter().take(count).skip(1) {
        path.line_to((x as f32, y as f32));
    }

    Some(path.detach())
}

fn draw_graph_path(
    canvas: &skia_safe::Canvas,
    node: &ResolvedNode,
    width: f64,
    height: f64,
    points: &[(f64, f64)],
    color: (u8, u8, u8),
    stroke_width: f64,
    draw_progress: f64,
) {
    if stroke_width <= 0.0 {
        return;
    }

    let Some(path) = path_from_points(points, draw_progress) else {
        return;
    };

    let alpha = (255.0 * node.opacity.clamp(0.0, 1.0)) as u8;
    let mut paint = make_paint(alpha, color, paint::Style::Stroke);
    paint.set_stroke_width(stroke_width as f32);

    canvas.save();
    apply_node_transform(canvas, node, width as f32, height as f32);
    canvas.draw_path(&path, &paint);
    canvas.restore();
}

fn draw_function_graph(
    canvas: &skia_safe::Canvas,
    node: &ResolvedNode,
    graph: &ResolvedFunctionGraph,
) {
    let alpha = (255.0 * node.opacity.clamp(0.0, 1.0)) as u8;

    canvas.save();
    apply_node_transform(canvas, node, graph.width as f32, graph.height as f32);

    if graph.show_grid {
        let mut grid_paint = make_paint(alpha / 3, muted_color(graph.color, 0.45), paint::Style::Stroke);
        grid_paint.set_stroke_width(1.0);

        const GRID_DIVISIONS: usize = 5;
        for step in 0..=GRID_DIVISIONS {
            let ratio = step as f32 / GRID_DIVISIONS as f32;
            let x = graph.width as f32 * ratio;
            let y = graph.height as f32 * ratio;
            canvas.draw_line((x, 0.0), (x, graph.height as f32), &grid_paint);
            canvas.draw_line((0.0, y), (graph.width as f32, y), &grid_paint);
        }
    }

    if graph.show_axes {
        if let (Some([x_min, x_max]), Some([y_min, y_max])) = (graph.x_range, graph.y_range) {
            let mut axis_paint = make_paint(alpha / 2, muted_color(graph.color, 0.65), paint::Style::Stroke);
            axis_paint.set_stroke_width(1.5);

            if x_min <= 0.0 && x_max >= 0.0 && x_min != x_max {
                let axis_x = ((0.0 - x_min) / (x_max - x_min) * graph.width) as f32;
                canvas.draw_line((axis_x, 0.0), (axis_x, graph.height as f32), &axis_paint);
            }

            if y_min <= 0.0 && y_max >= 0.0 && y_min != y_max {
                let axis_y =
                    (graph.height - ((0.0 - y_min) / (y_max - y_min) * graph.height)) as f32;
                canvas.draw_line((0.0, axis_y), (graph.width as f32, axis_y), &axis_paint);
            }
        }
    }

    if graph.stroke_width > 0.0 {
        let Some(path) = path_from_points(&graph.points, graph.draw_progress) else {
            canvas.restore();
            return;
        };
        let mut paint = make_paint(alpha, graph.color, paint::Style::Stroke);
        paint.set_stroke_width(graph.stroke_width as f32);
        canvas.draw_path(&path, &paint);
    }

    canvas.restore();
}

fn draw_parametric_graph(
    canvas: &skia_safe::Canvas,
    node: &ResolvedNode,
    graph: &ResolvedParametricGraph,
) {
    draw_graph_path(
        canvas,
        node,
        graph.width,
        graph.height,
        &graph.points,
        graph.color,
        graph.stroke_width,
        graph.draw_progress,
    );
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
    use crate::schema::{IconLineCap, IconLineJoin, IconPathPrimitive, IconPrimitive};
    use crate::shared::types::{
        ResolvedArrow, ResolvedFrame, ResolvedFunctionGraph, ResolvedIcon, ResolvedNode,
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
    fn function_graph_rendering_should_paint_non_background_pixels() {
        let frame = ResolvedFrame {
            background: (255, 255, 255),
            nodes: vec![ResolvedNode {
                batch_kind: ResolvedNodeBatchKind::Dynamic,
                data: ResolvedNodeData::FunctionGraph(ResolvedFunctionGraph {
                    width: 64.0,
                    height: 64.0,
                    points: vec![(0.0, 48.0), (16.0, 32.0), (32.0, 16.0), (48.0, 8.0), (64.0, 0.0)],
                    color: (0, 0, 0),
                    stroke_width: 2.0,
                    show_axes: true,
                    show_grid: true,
                    draw_progress: 1.0,
                    x_range: Some([-1.0, 1.0]),
                    y_range: Some([-1.0, 1.0]),
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
        let mut buffer = FrameBuffer::new(72, 72);

        backend
            .render_into(&frame, &mut buffer, &measurer as &dyn TextMeasurer)
            .expect("function graph frame should render");

        assert!(
            buffer
                .pixels()
                .chunks_exact(4)
                .any(|pixel| pixel[0] != 255 || pixel[1] != 255 || pixel[2] != 255),
            "expected function graph rendering to change at least one pixel"
        );
    }
}
