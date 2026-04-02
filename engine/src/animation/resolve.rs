use std::collections::HashMap;

use crate::color;
use crate::layout;
use crate::schema::{
    Anchor, IconLineCap, IconLineJoin, LineEndpoint, LineHead, Node, NodeBase, TextAlign,
};
use crate::scene::consts::{DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT_MULT, DEFAULT_TEXT_COLOR};
use crate::scene::types::{
    ResolvedCircle, ResolvedFrame, ResolvedFunctionGraph, ResolvedIcon,
    ResolvedLine, ResolvedNode, ResolvedNodeBatchKind, ResolvedNodeData, ResolvedParametricGraph,
    ResolvedRect, ResolvedText,
};
use crate::text::TextMeasurer;

use super::compile::{scene_for_frame, CompiledVideo, NodeTracks};
use super::snapshot::snapshot_nodes;

const DEFAULT_LINE_HEAD_SIZE: f64 = 12.0;

fn resolve_common(
    base: &NodeBase,
    batch_kind: ResolvedNodeBatchKind,
    tracks: &NodeTracks,
    layout_box: layout::LayoutBox,
    source_index: usize,
    t: f64,
    data: ResolvedNodeData,
) -> ResolvedNode {
    let scale = base.scale.unwrap_or(1.0);
    ResolvedNode {
        batch_kind,
        data,
        opacity: tracks.num("opacity", base.opacity.unwrap_or(1.0), t),
        rotation: tracks.num("rotate", base.rotate.unwrap_or(0.0), t),
        scale_x: tracks.num("scaleX", base.scale_x.unwrap_or(scale), t),
        scale_y: tracks.num("scaleY", base.scale_y.unwrap_or(scale), t),
        skew_x: tracks.num("skewX", base.skew_x.unwrap_or(0.0), t),
        skew_y: tracks.num("skewY", base.skew_y.unwrap_or(0.0), t),
        source_index,
        x: layout_box.x,
        y: layout_box.y,
        z_index: base.z_index.unwrap_or(0),
    }
}

fn layout_anchor_point(layout_box: layout::LayoutBox, anchor: Anchor) -> (f64, f64) {
    match anchor {
        Anchor::TopLeft => (layout_box.x, layout_box.y),
        Anchor::TopCenter => (layout_box.x + layout_box.width / 2.0, layout_box.y),
        Anchor::TopRight => (layout_box.x + layout_box.width, layout_box.y),
        Anchor::CenterLeft => (layout_box.x, layout_box.y + layout_box.height / 2.0),
        Anchor::Center => (
            layout_box.x + layout_box.width / 2.0,
            layout_box.y + layout_box.height / 2.0,
        ),
        Anchor::CenterRight => (
            layout_box.x + layout_box.width,
            layout_box.y + layout_box.height / 2.0,
        ),
        Anchor::BottomLeft => (layout_box.x, layout_box.y + layout_box.height),
        Anchor::BottomCenter => (
            layout_box.x + layout_box.width / 2.0,
            layout_box.y + layout_box.height,
        ),
        Anchor::BottomRight => (
            layout_box.x + layout_box.width,
            layout_box.y + layout_box.height,
        ),
    }
}

fn resolve_line_endpoint(
    endpoint: &LineEndpoint,
    layout_boxes: &HashMap<String, layout::LayoutBox>,
) -> Result<(f64, f64), String> {
    match endpoint {
        LineEndpoint::Point(point) => Ok((point.x, point.y)),
        LineEndpoint::NodeRef(node_ref) => {
            let target_box = layout_boxes
                .get(&node_ref.node)
                .copied()
                .ok_or_else(|| format!("missing line endpoint node {}", node_ref.node))?;
            Ok(layout_anchor_point(
                target_box,
                node_ref.anchor.unwrap_or(Anchor::Center),
            ))
        }
    }
}

fn resolve_line_node(
    line: &crate::schema::LineNode,
    batch_kind: ResolvedNodeBatchKind,
    tracks: &NodeTracks,
    layout_box: layout::LayoutBox,
    source_index: usize,
    t: f64,
    layout_boxes: &HashMap<String, layout::LayoutBox>,
) -> Result<ResolvedNode, String> {
    let uses_coordinate_mode =
        line.x1.is_some() || line.y1.is_some() || line.x2.is_some() || line.y2.is_some();
    let uses_endpoint_mode = line.from.is_some() || line.to.is_some();
    let (start, end) = if uses_coordinate_mode && uses_endpoint_mode {
        return Err("line cannot mix absolute coordinates with from/to endpoints".to_string());
    } else if let (Some(from), Some(to)) = (&line.from, &line.to) {
        (
            resolve_line_endpoint(from, layout_boxes)?,
            resolve_line_endpoint(to, layout_boxes)?,
        )
    } else if uses_endpoint_mode {
        return Err("line endpoint mode requires both from and to".to_string());
    } else if let (Some(x1), Some(y1), Some(x2), Some(y2)) = (line.x1, line.y1, line.x2, line.y2)
    {
        (
            (tracks.num("x1", x1, t), tracks.num("y1", y1, t)),
            (tracks.num("x2", x2, t), tracks.num("y2", y2, t)),
        )
    } else if uses_coordinate_mode {
        return Err("line absolute mode requires x1, y1, x2, and y2".to_string());
    } else {
        return Err("line must define either x1/y1/x2/y2 or both from and to".to_string());
    };

    let start = (start.0 + layout_box.x, start.1 + layout_box.y);
    let end = (end.0 + layout_box.x, end.1 + layout_box.y);
    let min_x = start.0.min(end.0);
    let min_y = start.1.min(end.1);
    let max_x = start.0.max(end.0);
    let max_y = start.1.max(end.1);
    let stroke_hex = tracks
        .color(
            "stroke",
            Some(line.stroke.as_deref().unwrap_or(DEFAULT_TEXT_COLOR)),
            t,
        )
        .unwrap_or_else(|| DEFAULT_TEXT_COLOR.to_string());

    Ok(resolve_common(
        &line.base,
        batch_kind,
        tracks,
        layout::LayoutBox {
            x: min_x,
            y: min_y,
            width: max_x - min_x,
            height: max_y - min_y,
        },
        source_index,
        t,
        ResolvedNodeData::Line(ResolvedLine {
            x1: start.0 - min_x,
            y1: start.1 - min_y,
            x2: end.0 - min_x,
            y2: end.1 - min_y,
            stroke: color::parse_hex(&stroke_hex),
            stroke_width: tracks.num("strokeWidth", line.stroke_width.unwrap_or(2.0), t),
            cap: line.cap.unwrap_or(crate::schema::LineCap::Round),
            draw_progress: tracks
                .num("drawProgress", line.draw_progress.unwrap_or(1.0), t)
                .clamp(0.0, 1.0),
            head: line.head.unwrap_or(LineHead::None),
            head_size: line.head_size.unwrap_or(DEFAULT_LINE_HEAD_SIZE),
        }),
    ))
}

fn resolve_circle_node(
    circle: &crate::schema::CircleNode,
    batch_kind: ResolvedNodeBatchKind,
    tracks: &NodeTracks,
    layout_box: layout::LayoutBox,
    source_index: usize,
    t: f64,
) -> ResolvedNode {
    resolve_common(
        &circle.base,
        batch_kind,
        tracks,
        layout_box,
        source_index,
        t,
        ResolvedNodeData::Circle(ResolvedCircle {
            radius: tracks.num("radius", circle.radius, t),
            fill: tracks
                .color("fill", circle.fill.as_deref(), t)
                .as_deref()
                .map(color::parse_hex),
            stroke: tracks
                .color("stroke", circle.stroke.as_deref(), t)
                .as_deref()
                .map(color::parse_hex),
            stroke_width: tracks.num("strokeWidth", circle.stroke_width.unwrap_or(2.0), t),
            draw_progress: tracks
                .num("drawProgress", circle.draw_progress.unwrap_or(1.0), t)
                .clamp(0.0, 1.0),
        }),
    )
}

fn resolve_function_graph_node(
    graph: &crate::schema::FunctionGraphNode,
    batch_kind: ResolvedNodeBatchKind,
    tracks: &NodeTracks,
    layout_box: layout::LayoutBox,
    source_index: usize,
    t: f64,
) -> ResolvedNode {
    let color_hex = tracks
        .color(
            "color",
            Some(graph.color.as_deref().unwrap_or(DEFAULT_TEXT_COLOR)),
            t,
        )
        .unwrap_or_else(|| DEFAULT_TEXT_COLOR.to_string());

    resolve_common(
        &graph.base,
        batch_kind,
        tracks,
        layout_box,
        source_index,
        t,
        ResolvedNodeData::FunctionGraph(ResolvedFunctionGraph {
            width: graph.width,
            height: graph.height,
            points: graph.points.iter().map(|point| (point.x, point.y)).collect(),
            color: color::parse_hex(&color_hex),
            stroke_width: tracks.num("strokeWidth", graph.stroke_width.unwrap_or(2.0), t),
            show_axes: graph.show_axes.unwrap_or(false),
            show_grid: graph.show_grid.unwrap_or(false),
            draw_progress: tracks.num("drawProgress", graph.draw_progress.unwrap_or(1.0), t),
            x_range: graph.x_range,
            y_range: graph.y_range,
        }),
    )
}

fn resolve_parametric_graph_node(
    graph: &crate::schema::ParametricGraphNode,
    batch_kind: ResolvedNodeBatchKind,
    tracks: &NodeTracks,
    layout_box: layout::LayoutBox,
    source_index: usize,
    t: f64,
) -> ResolvedNode {
    let color_hex = tracks
        .color(
            "color",
            Some(graph.color.as_deref().unwrap_or(DEFAULT_TEXT_COLOR)),
            t,
        )
        .unwrap_or_else(|| DEFAULT_TEXT_COLOR.to_string());

    resolve_common(
        &graph.base,
        batch_kind,
        tracks,
        layout_box,
        source_index,
        t,
        ResolvedNodeData::ParametricGraph(ResolvedParametricGraph {
            width: graph.width,
            height: graph.height,
            points: graph.points.iter().map(|point| (point.x, point.y)).collect(),
            color: color::parse_hex(&color_hex),
            stroke_width: tracks.num("strokeWidth", graph.stroke_width.unwrap_or(2.0), t),
            draw_progress: tracks.num("drawProgress", graph.draw_progress.unwrap_or(1.0), t),
        }),
    )
}

fn resolve_node(
    node: &Node,
    batch_kind: ResolvedNodeBatchKind,
    tracks: &NodeTracks,
    layout_box: layout::LayoutBox,
    source_index: usize,
    t: f64,
    layout_boxes: &HashMap<String, layout::LayoutBox>,
) -> Result<Option<ResolvedNode>, String> {
    match node {
        Node::Circle(circle) => Ok(Some(resolve_circle_node(
            circle,
            batch_kind,
            tracks,
            layout_box,
            source_index,
            t,
        ))),
        Node::FunctionGraph(graph) => Ok(Some(resolve_function_graph_node(
            graph,
            batch_kind,
            tracks,
            layout_box,
            source_index,
            t,
        ))),
        Node::Icon(icon) => {
            let stroke_hex = tracks
                .color(
                    "stroke",
                    Some(icon.stroke.as_deref().unwrap_or(DEFAULT_TEXT_COLOR)),
                    t,
                )
                .unwrap_or_else(|| DEFAULT_TEXT_COLOR.to_string());
            Ok(Some(resolve_common(
                &icon.base,
                batch_kind,
                tracks,
                layout_box,
                source_index,
                t,
                ResolvedNodeData::Icon(ResolvedIcon {
                    width: tracks.num("width", icon.width, t),
                    height: tracks.num("height", icon.height, t),
                    viewport_width: icon.viewport_width.unwrap_or(24.0),
                    viewport_height: icon.viewport_height.unwrap_or(24.0),
                    stroke: color::parse_hex(&stroke_hex),
                    fill: tracks
                        .color("fill", icon.fill.as_deref(), t)
                        .as_deref()
                        .map(color::parse_hex),
                    stroke_width: tracks.num("strokeWidth", icon.stroke_width.unwrap_or(2.0), t),
                    absolute_stroke_width: icon.absolute_stroke_width.unwrap_or(false),
                    line_cap: icon.line_cap.unwrap_or(IconLineCap::Round),
                    line_join: icon.line_join.unwrap_or(IconLineJoin::Round),
                    elements: icon.elements.clone(),
                }),
            )))
        }
        Node::Line(line) => Ok(Some(resolve_line_node(
            line,
            batch_kind,
            tracks,
            layout_box,
            source_index,
            t,
            layout_boxes,
        )?)),
        Node::ParametricGraph(graph) => Ok(Some(resolve_parametric_graph_node(
            graph,
            batch_kind,
            tracks,
            layout_box,
            source_index,
            t,
        ))),
        Node::Rect(rect) => Ok(Some(resolve_common(
            &rect.base,
            batch_kind,
            tracks,
            layout_box,
            source_index,
            t,
            ResolvedNodeData::Rect(ResolvedRect {
                width: tracks.num("width", rect.width, t),
                height: tracks.num("height", rect.height, t),
                fill: tracks
                    .color("fill", rect.fill.as_deref(), t)
                    .as_deref()
                    .map(color::parse_hex),
                stroke: tracks
                    .color("stroke", rect.stroke.as_deref(), t)
                    .as_deref()
                    .map(color::parse_hex),
                stroke_width: tracks.num("strokeWidth", rect.stroke_width.unwrap_or(0.0), t),
                corner_radius: tracks.num("cornerRadius", rect.corner_radius.unwrap_or(0.0), t),
            }),
        ))),
        Node::Text(text) => {
            let font_size = tracks.num("size", text.size.unwrap_or(DEFAULT_FONT_SIZE), t);
            let color_hex = tracks
                .color(
                    "color",
                    Some(text.color.as_deref().unwrap_or(DEFAULT_TEXT_COLOR)),
                    t,
                )
                .unwrap_or_else(|| DEFAULT_TEXT_COLOR.to_string());
            Ok(Some(resolve_common(
                &text.base,
                batch_kind,
                tracks,
                layout_box,
                source_index,
                t,
                ResolvedNodeData::Text(ResolvedText {
                    text: text.text.clone(),
                    color: color::parse_hex(&color_hex),
                    font_family: text.font_family.clone(),
                    font_size,
                    line_height: text
                        .line_height
                        .unwrap_or(font_size * DEFAULT_LINE_HEIGHT_MULT),
                    max_width: text.max_width,
                    text_align: text.text_align.unwrap_or(TextAlign::Left),
                }),
            )))
        }
        _ => Ok(None),
    }
}

pub fn resolve_frame_fast(
    compiled: &CompiledVideo<'_>,
    absolute_frame: u32,
    measurer: &impl TextMeasurer,
) -> Result<ResolvedFrame, String> {
    let Some(scene) = scene_for_frame(compiled, absolute_frame) else {
        return Ok(ResolvedFrame {
            background: compiled.background,
            nodes: vec![],
            scene_cache_key: 0,
        });
    };

    let t = (absolute_frame - scene.start_frame) as f64 / scene.fps;
    let layout_positions = if let Some(layout) = &scene.cached_layout {
        layout.clone()
    } else {
        let snapshot = snapshot_nodes(scene.nodes, &scene.node_tracks, t);
        layout::resolve_layout(
            &snapshot,
            compiled.width as f64,
            compiled.height as f64,
            measurer,
        )?
    };

    let source_nodes = if scene.cached_layout.is_some() {
        None
    } else {
        Some(snapshot_nodes(scene.nodes, &scene.node_tracks, t))
    };
    let nodes_ref = source_nodes.as_ref().unwrap_or(scene.nodes);
    let nodes_are_snapshots = source_nodes.is_some();

    let mut nodes = Vec::with_capacity(nodes_ref.len());
    for (source_index, (id, node)) in nodes_ref.iter().enumerate() {
        let pos = layout_positions
            .get(id)
            .copied()
            .ok_or_else(|| format!("missing layout position for node {id}"))?;
        let default_tracks = NodeTracks::default();
        let tracks = if nodes_are_snapshots {
            &default_tracks
        } else {
            scene.node_tracks.get(id).unwrap_or(&default_tracks)
        };
        let batch_kind = *scene
            .render_batch_kinds
            .get(id)
            .unwrap_or(&ResolvedNodeBatchKind::Dynamic);
        if let Some(resolved) = resolve_node(
            node,
            batch_kind,
            tracks,
            pos,
            source_index,
            t,
            &layout_positions,
        )? {
            nodes.push(resolved);
        }
    }

    nodes.sort_by(|a, b| {
        a.z_index
            .cmp(&b.z_index)
            .then(a.source_index.cmp(&b.source_index))
    });

    Ok(ResolvedFrame {
        background: scene.background,
        nodes,
        scene_cache_key: scene.render_cache_key,
    })
}

#[cfg(test)]
mod tests {
    use indexmap::IndexMap;

    use super::resolve_frame_fast;
    use crate::animation::compile::compile_video;
    use crate::schema::{
        CircleNode, EventTarget, LineCap, LineHead, LineNode, Node, NodeBase, SceneEntry,
        TimelineEvent, VideoDescription,
    };
    use crate::scene::types::ResolvedNodeData;
    use crate::text::SkiaTextMeasurer;

    #[test]
    fn resolve_frame_fast_should_resolve_circle_and_line_tracks() {
        let mut nodes = IndexMap::new();
        nodes.insert(
            "circle".to_string(),
            Node::Circle(CircleNode {
                base: NodeBase {
                    x: Some(20.0),
                    y: Some(24.0),
                    ..NodeBase::default()
                },
                radius: 16.0,
                fill: Some("#38bdf8".to_string()),
                stroke: Some("#f8fafc".to_string()),
                stroke_width: Some(2.0),
                draw_progress: Some(0.0),
            }),
        );
        nodes.insert(
            "line".to_string(),
            Node::Line(LineNode {
                base: NodeBase {
                    x: Some(12.0),
                    y: Some(80.0),
                    ..NodeBase::default()
                },
                x1: Some(0.0),
                y1: Some(0.0),
                x2: Some(80.0),
                y2: Some(0.0),
                from: None,
                to: None,
                stroke: Some("#f8fafc".to_string()),
                stroke_width: Some(2.0),
                cap: Some(LineCap::Round),
                draw_progress: Some(0.0),
                head: Some(LineHead::End),
                head_size: Some(10.0),
            }),
        );

        let desc = VideoDescription {
            fps: 30.0,
            width: 320,
            height: 180,
            background: Some("#000000".to_string()),
            scenes: vec![SceneEntry {
                id: "scene-1".to_string(),
                background: None,
                duration: 30,
                start_frame: 0,
                nodes,
                timeline: vec![
                    TimelineEvent {
                        target: EventTarget::Single("circle".to_string()),
                        at: 0.0,
                        dur: Some(1.0),
                        ease: None,
                        action: None,
                        opacity: None,
                        x: None,
                        y: None,
                        dx: None,
                        dy: None,
                        width: None,
                        height: None,
                        radius: Some(32.0),
                        x1: None,
                        y1: None,
                        x2: None,
                        y2: None,
                        rotate: None,
                        scale: None,
                        scale_x: None,
                        scale_y: None,
                        skew_x: None,
                        skew_y: None,
                        corner_radius: None,
                        stroke_width: None,
                        size: None,
                        draw_progress: Some(1.0),
                        fill: None,
                        stroke: None,
                        color: None,
                    },
                    TimelineEvent {
                        target: EventTarget::Single("line".to_string()),
                        at: 0.0,
                        dur: Some(1.0),
                        ease: None,
                        action: None,
                        opacity: None,
                        x: None,
                        y: None,
                        dx: None,
                        dy: None,
                        width: None,
                        height: None,
                        radius: None,
                        x1: None,
                        y1: None,
                        x2: Some(120.0),
                        y2: None,
                        rotate: None,
                        scale: None,
                        scale_x: None,
                        scale_y: None,
                        skew_x: None,
                        skew_y: None,
                        corner_radius: None,
                        stroke_width: Some(4.0),
                        size: None,
                        draw_progress: Some(1.0),
                        fill: None,
                        stroke: Some("#38bdf8".to_string()),
                        color: None,
                    },
                ],
            }],
        };
        let measurer = SkiaTextMeasurer::new();
        let compiled = compile_video(&desc, &measurer).expect("video should compile");
        let frame = resolve_frame_fast(&compiled, 15, &measurer).expect("frame should resolve");

        let circle = frame
            .nodes
            .iter()
            .find_map(|node| match &node.data {
                ResolvedNodeData::Circle(circle) => Some(circle),
                _ => None,
            })
            .expect("circle should resolve");
        let line = frame
            .nodes
            .iter()
            .find_map(|node| match &node.data {
                ResolvedNodeData::Line(line) => Some(line),
                _ => None,
            })
            .expect("line should resolve");

        assert!(
            (circle.radius - 28.0).abs() < 1e-9,
            "unexpected circle radius {}",
            circle.radius
        );
        assert!(
            (circle.draw_progress - 0.75).abs() < 1e-9,
            "unexpected circle draw progress {}",
            circle.draw_progress
        );
        assert!(
            (line.x2 - 110.0).abs() < 1e-9,
            "unexpected line x2 {}",
            line.x2
        );
        assert_ne!(line.stroke, (248, 250, 252));
        assert_ne!(line.stroke, (56, 189, 248));
        assert!(
            (line.stroke_width - 3.5).abs() < 1e-9,
            "unexpected line stroke width {}",
            line.stroke_width
        );
        assert!(
            (line.draw_progress - 0.75).abs() < 1e-9,
            "unexpected line draw progress {}",
            line.draw_progress
        );
    }
}
