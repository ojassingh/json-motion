use super::path_pipeline::{self, PathVertex, StrokeStyle};
use super::util::{muted_color, rgba, stroke_style};
use crate::scene::types::{
    ResolvedArrow, ResolvedCircle, ResolvedFunctionGraph, ResolvedLine, ResolvedNode,
    ResolvedParametricGraph,
};

struct PathGeometrySpec<'a> {
    d: &'a str,
    fill_color: Option<[f32; 4]>,
    height: f64,
    stroke: Option<StrokeStyle>,
    width: f64,
}

fn append_svg_path_geometry(
    node: &ResolvedNode,
    spec: PathGeometrySpec<'_>,
    out_vertices: &mut Vec<PathVertex>,
    out_indices: &mut Vec<u32>,
) {
    let (vertices, indices) =
        path_pipeline::tessellate_svg_path(spec.d, spec.fill_color, spec.stroke.as_ref());
    path_pipeline::append_transformed_geometry(
        node,
        spec.width,
        spec.height,
        &vertices,
        &indices,
        out_vertices,
        out_indices,
    );
}

fn svg_line_path(start: (f64, f64), end: (f64, f64)) -> String {
    format!("M{} {} L{} {}", start.0, start.1, end.0, end.1)
}

fn svg_polyline_path(points: &[(f64, f64)], close: bool) -> Option<String> {
    let (first_x, first_y) = *points.first()?;
    let mut d = format!("M{first_x} {first_y}");
    for (x, y) in points.iter().skip(1) {
        d.push_str(&format!(" L{x} {y}"));
    }
    if close {
        d.push_str(" Z");
    }
    Some(d)
}

fn svg_circle_path(radius: f64) -> String {
    format!(
        "M0,{r} a{r},{r} 0 1,0 {diameter},0 a{r},{r} 0 1,0 -{diameter},0",
        r = radius,
        diameter = radius * 2.0
    )
}

fn svg_arc_path(radius: f64, progress: f64) -> Option<String> {
    let clamped = progress.clamp(0.0, 1.0);
    if clamped <= 0.0 {
        return None;
    }
    if clamped >= 0.999_999 {
        return Some(svg_circle_path(radius));
    }

    let start_angle = -std::f64::consts::FRAC_PI_2;
    let end_angle = start_angle + std::f64::consts::TAU * clamped;
    let cx = radius;
    let cy = radius;
    let start_x = cx + radius * start_angle.cos();
    let start_y = cy + radius * start_angle.sin();
    let end_x = cx + radius * end_angle.cos();
    let end_y = cy + radius * end_angle.sin();
    let large_arc = u8::from(clamped > 0.5);
    Some(format!(
        "M{start_x} {start_y} A{radius} {radius} 0 {large_arc} 1 {end_x} {end_y}"
    ))
}

fn line_cap_to_lyon(cap: crate::schema::LineCap) -> lyon::tessellation::LineCap {
    match cap {
        crate::schema::LineCap::Round => lyon::tessellation::LineCap::Round,
        crate::schema::LineCap::Square => lyon::tessellation::LineCap::Square,
        crate::schema::LineCap::Butt => lyon::tessellation::LineCap::Butt,
    }
}

fn graph_visible_points(points: &[(f64, f64)], draw_progress: f64) -> Option<&[(f64, f64)]> {
    let count = ((points.len() as f64) * draw_progress.clamp(0.0, 1.0)).floor() as usize;
    if count < 2 {
        return None;
    }
    Some(&points[..count])
}

pub(super) fn append_arrow_geometry(
    node: &ResolvedNode,
    arrow: &ResolvedArrow,
    out_vertices: &mut Vec<PathVertex>,
    out_indices: &mut Vec<u32>,
) {
    if arrow.stroke_width <= 0.0 {
        return;
    }

    let shaft_path = svg_line_path(arrow.start, arrow.end);
    append_svg_path_geometry(
        node,
        PathGeometrySpec {
            d: &shaft_path,
            fill_color: None,
            height: arrow.height,
            stroke: Some(stroke_style(
                arrow.stroke,
                arrow.stroke_width,
                lyon::tessellation::LineCap::Butt,
                lyon::tessellation::LineJoin::MiterClip,
                1.0,
            )),
            width: arrow.width,
        },
        out_vertices,
        out_indices,
    );

    let dx = arrow.end.0 - arrow.start.0;
    let dy = arrow.end.1 - arrow.start.1;
    let length = (dx * dx + dy * dy).sqrt();
    if length <= f64::EPSILON {
        return;
    }

    let ux = dx / length;
    let uy = dy / length;
    let nx = -uy;
    let ny = ux;
    let back_x = arrow.end.0 - ux * arrow.head_size;
    let back_y = arrow.end.1 - uy * arrow.head_size;
    let wing = arrow.head_size * 0.45;
    let points = [
        arrow.end,
        (back_x + nx * wing, back_y + ny * wing),
        (back_x - nx * wing, back_y - ny * wing),
    ];
    if let Some(head_path) = svg_polyline_path(&points, true) {
        append_svg_path_geometry(
            node,
            PathGeometrySpec {
                d: &head_path,
                fill_color: Some(rgba(arrow.stroke, 1.0)),
                height: arrow.height,
                stroke: None,
                width: arrow.width,
            },
            out_vertices,
            out_indices,
        );
    }
}

pub(super) fn append_circle_geometry(
    node: &ResolvedNode,
    circle: &ResolvedCircle,
    out_vertices: &mut Vec<PathVertex>,
    out_indices: &mut Vec<u32>,
) {
    let diameter = circle.radius * 2.0;
    let full_circle_path = svg_circle_path(circle.radius);

    if let Some(fill) = circle.fill {
        append_svg_path_geometry(
            node,
            PathGeometrySpec {
                d: &full_circle_path,
                fill_color: Some(rgba(fill, 1.0)),
                height: diameter,
                stroke: None,
                width: diameter,
            },
            out_vertices,
            out_indices,
        );
    }

    if let Some(stroke) = circle.stroke {
        if circle.stroke_width > 0.0 {
            if let Some(stroke_path) = svg_arc_path(circle.radius, circle.draw_progress) {
                append_svg_path_geometry(
                    node,
                    PathGeometrySpec {
                        d: &stroke_path,
                        fill_color: None,
                        height: diameter,
                        stroke: Some(stroke_style(
                            stroke,
                            circle.stroke_width,
                            lyon::tessellation::LineCap::Butt,
                            lyon::tessellation::LineJoin::Round,
                            1.0,
                        )),
                        width: diameter,
                    },
                    out_vertices,
                    out_indices,
                );
            }
        }
    }
}

pub(super) fn append_function_graph_geometry(
    node: &ResolvedNode,
    graph: &ResolvedFunctionGraph,
    out_vertices: &mut Vec<PathVertex>,
    out_indices: &mut Vec<u32>,
) {
    const GRID_DIVISIONS: usize = 5;

    if graph.show_grid {
        let grid_color = muted_color(graph.color, 0.45);
        for step in 0..=GRID_DIVISIONS {
            let ratio = step as f64 / GRID_DIVISIONS as f64;
            let x = graph.width * ratio;
            let y = graph.height * ratio;
            for path in [
                svg_line_path((x, 0.0), (x, graph.height)),
                svg_line_path((0.0, y), (graph.width, y)),
            ] {
                append_svg_path_geometry(
                    node,
                    PathGeometrySpec {
                        d: &path,
                        fill_color: None,
                        height: graph.height,
                        stroke: Some(stroke_style(
                            grid_color,
                            1.0,
                            lyon::tessellation::LineCap::Butt,
                            lyon::tessellation::LineJoin::MiterClip,
                            1.0 / 3.0,
                        )),
                        width: graph.width,
                    },
                    out_vertices,
                    out_indices,
                );
            }
        }
    }

    if graph.show_axes {
        if let (Some([x_min, x_max]), Some([y_min, y_max])) = (graph.x_range, graph.y_range) {
            let axis_color = muted_color(graph.color, 0.65);
            if x_min <= 0.0 && x_max >= 0.0 && x_min != x_max {
                let axis_x = (0.0 - x_min) / (x_max - x_min) * graph.width;
                let path = svg_line_path((axis_x, 0.0), (axis_x, graph.height));
                append_svg_path_geometry(
                    node,
                    PathGeometrySpec {
                        d: &path,
                        fill_color: None,
                        height: graph.height,
                        stroke: Some(stroke_style(
                            axis_color,
                            1.5,
                            lyon::tessellation::LineCap::Butt,
                            lyon::tessellation::LineJoin::MiterClip,
                            0.5,
                        )),
                        width: graph.width,
                    },
                    out_vertices,
                    out_indices,
                );
            }
            if y_min <= 0.0 && y_max >= 0.0 && y_min != y_max {
                let axis_y = graph.height - ((0.0 - y_min) / (y_max - y_min) * graph.height);
                let path = svg_line_path((0.0, axis_y), (graph.width, axis_y));
                append_svg_path_geometry(
                    node,
                    PathGeometrySpec {
                        d: &path,
                        fill_color: None,
                        height: graph.height,
                        stroke: Some(stroke_style(
                            axis_color,
                            1.5,
                            lyon::tessellation::LineCap::Butt,
                            lyon::tessellation::LineJoin::MiterClip,
                            0.5,
                        )),
                        width: graph.width,
                    },
                    out_vertices,
                    out_indices,
                );
            }
        }
    }

    if graph.stroke_width <= 0.0 {
        return;
    }
    let Some(points) = graph_visible_points(&graph.points, graph.draw_progress) else {
        return;
    };
    let Some(path) = svg_polyline_path(points, false) else {
        return;
    };
    append_svg_path_geometry(
        node,
        PathGeometrySpec {
            d: &path,
            fill_color: None,
            height: graph.height,
            stroke: Some(stroke_style(
                graph.color,
                graph.stroke_width,
                lyon::tessellation::LineCap::Butt,
                lyon::tessellation::LineJoin::MiterClip,
                1.0,
            )),
            width: graph.width,
        },
        out_vertices,
        out_indices,
    );
}

pub(super) fn append_line_geometry(
    node: &ResolvedNode,
    line: &ResolvedLine,
    out_vertices: &mut Vec<PathVertex>,
    out_indices: &mut Vec<u32>,
) {
    if line.stroke_width <= 0.0 {
        return;
    }
    let progress = line.draw_progress.clamp(0.0, 1.0);
    if progress <= 0.0 {
        return;
    }
    let dx = line.x2 - line.x1;
    let dy = line.y2 - line.y1;
    let end = (line.x1 + dx * progress, line.y1 + dy * progress);
    let width = (line.x2 - line.x1).abs();
    let height = (line.y2 - line.y1).abs();
    let path = svg_line_path((line.x1, line.y1), end);
    append_svg_path_geometry(
        node,
        PathGeometrySpec {
            d: &path,
            fill_color: None,
            height,
            stroke: Some(stroke_style(
                line.stroke,
                line.stroke_width,
                line_cap_to_lyon(line.cap),
                lyon::tessellation::LineJoin::MiterClip,
                1.0,
            )),
            width,
        },
        out_vertices,
        out_indices,
    );
}

pub(super) fn append_parametric_graph_geometry(
    node: &ResolvedNode,
    graph: &ResolvedParametricGraph,
    out_vertices: &mut Vec<PathVertex>,
    out_indices: &mut Vec<u32>,
) {
    if graph.stroke_width <= 0.0 {
        return;
    }
    let Some(points) = graph_visible_points(&graph.points, graph.draw_progress) else {
        return;
    };
    let Some(path) = svg_polyline_path(points, false) else {
        return;
    };
    append_svg_path_geometry(
        node,
        PathGeometrySpec {
            d: &path,
            fill_color: None,
            height: graph.height,
            stroke: Some(stroke_style(
                graph.color,
                graph.stroke_width,
                lyon::tessellation::LineCap::Butt,
                lyon::tessellation::LineJoin::MiterClip,
                1.0,
            )),
            width: graph.width,
        },
        out_vertices,
        out_indices,
    );
}

