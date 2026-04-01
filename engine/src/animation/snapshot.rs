use std::collections::HashMap;

use indexmap::IndexMap;

use crate::schema::{Node, NodeBase};
use crate::scene::consts::{DEFAULT_FONT_SIZE, DEFAULT_TEXT_COLOR};

use super::compile::NodeTracks;

pub(super) fn snapshot_nodes(
    nodes: &IndexMap<String, Node>,
    node_tracks: &HashMap<String, NodeTracks>,
    t: f64,
) -> IndexMap<String, Node> {
    let mut snapshot = nodes.clone();

    for (id, node) in &mut snapshot {
        let default_tracks = NodeTracks::default();
        let tracks = node_tracks.get(id).unwrap_or(&default_tracks);
        apply_base(node, tracks, t);
        apply_node_data(node, tracks, t);
    }

    snapshot
}

fn apply_base(node: &mut Node, tracks: &NodeTracks, t: f64) {
    let base = base_mut(node);
    let x = tracks.num("x", base.x.unwrap_or(0.0), t);
    let y = tracks.num("y", base.y.unwrap_or(0.0), t);
    base.x = Some(x + tracks.num("dx", 0.0, t));
    base.y = Some(y + tracks.num("dy", 0.0, t));
    base.opacity = Some(tracks.num("opacity", base.opacity.unwrap_or(1.0), t));
    base.rotate = Some(tracks.num("rotate", base.rotate.unwrap_or(0.0), t));
    base.scale_x = Some(tracks.num(
        "scaleX",
        base.scale_x.unwrap_or(base.scale.unwrap_or(1.0)),
        t,
    ));
    base.scale_y = Some(tracks.num(
        "scaleY",
        base.scale_y.unwrap_or(base.scale.unwrap_or(1.0)),
        t,
    ));
    base.skew_x = Some(tracks.num("skewX", base.skew_x.unwrap_or(0.0), t));
    base.skew_y = Some(tracks.num("skewY", base.skew_y.unwrap_or(0.0), t));
}

fn apply_node_data(node: &mut Node, tracks: &NodeTracks, t: f64) {
    match node {
        Node::Arrow(arrow) => {
            arrow.stroke = tracks.color(
                "stroke",
                Some(arrow.stroke.as_deref().unwrap_or(DEFAULT_TEXT_COLOR)),
                t,
            );
            arrow.stroke_width =
                Some(tracks.num("strokeWidth", arrow.stroke_width.unwrap_or(2.0), t));
        }
        Node::Circle(circle) => {
            circle.radius = tracks.num("radius", circle.radius, t);
            circle.fill = tracks.color("fill", circle.fill.as_deref(), t);
            circle.stroke = tracks.color("stroke", circle.stroke.as_deref(), t);
            circle.stroke_width =
                Some(tracks.num("strokeWidth", circle.stroke_width.unwrap_or(2.0), t));
            circle.draw_progress = Some(
                tracks
                    .num("drawProgress", circle.draw_progress.unwrap_or(1.0), t)
                    .clamp(0.0, 1.0),
            );
        }
        Node::FunctionGraph(graph) => {
            graph.color = tracks.color(
                "color",
                Some(graph.color.as_deref().unwrap_or(DEFAULT_TEXT_COLOR)),
                t,
            );
            graph.stroke_width =
                Some(tracks.num("strokeWidth", graph.stroke_width.unwrap_or(2.0), t));
            graph.draw_progress =
                Some(tracks.num("drawProgress", graph.draw_progress.unwrap_or(1.0), t));
        }
        Node::Icon(icon) => {
            icon.width = tracks.num("width", icon.width, t);
            icon.height = tracks.num("height", icon.height, t);
            icon.fill = tracks.color("fill", icon.fill.as_deref(), t);
            icon.stroke = tracks.color(
                "stroke",
                Some(icon.stroke.as_deref().unwrap_or(DEFAULT_TEXT_COLOR)),
                t,
            );
            icon.stroke_width =
                Some(tracks.num("strokeWidth", icon.stroke_width.unwrap_or(2.0), t));
        }
        Node::Line(line) => {
            line.x1 = tracks.num("x1", line.x1, t);
            line.y1 = tracks.num("y1", line.y1, t);
            line.x2 = tracks.num("x2", line.x2, t);
            line.y2 = tracks.num("y2", line.y2, t);
            line.stroke = tracks.color(
                "stroke",
                Some(line.stroke.as_deref().unwrap_or(DEFAULT_TEXT_COLOR)),
                t,
            );
            line.stroke_width =
                Some(tracks.num("strokeWidth", line.stroke_width.unwrap_or(2.0), t));
            line.draw_progress = Some(
                tracks
                    .num("drawProgress", line.draw_progress.unwrap_or(1.0), t)
                    .clamp(0.0, 1.0),
            );
        }
        Node::ParametricGraph(graph) => {
            graph.color = tracks.color(
                "color",
                Some(graph.color.as_deref().unwrap_or(DEFAULT_TEXT_COLOR)),
                t,
            );
            graph.stroke_width =
                Some(tracks.num("strokeWidth", graph.stroke_width.unwrap_or(2.0), t));
            graph.draw_progress =
                Some(tracks.num("drawProgress", graph.draw_progress.unwrap_or(1.0), t));
        }
        Node::Rect(rect) => {
            rect.width = tracks.num("width", rect.width, t);
            rect.height = tracks.num("height", rect.height, t);
            rect.fill = tracks.color("fill", rect.fill.as_deref(), t);
            rect.stroke = tracks.color("stroke", rect.stroke.as_deref(), t);
            rect.stroke_width =
                Some(tracks.num("strokeWidth", rect.stroke_width.unwrap_or(0.0), t));
            rect.corner_radius =
                Some(tracks.num("cornerRadius", rect.corner_radius.unwrap_or(0.0), t));
        }
        Node::Text(text) => {
            let font_size = tracks.num("size", text.size.unwrap_or(DEFAULT_FONT_SIZE), t);
            text.size = Some(font_size);
            text.color = tracks.color(
                "color",
                Some(text.color.as_deref().unwrap_or(DEFAULT_TEXT_COLOR)),
                t,
            );
        }
        _ => {}
    }
}

fn base_mut(node: &mut Node) -> &mut NodeBase {
    match node {
        Node::Align(node) => &mut node.base,
        Node::Arrow(node) => &mut node.base,
        Node::Circle(node) => &mut node.base,
        Node::Center(node) => &mut node.base,
        Node::FunctionGraph(node) => &mut node.base,
        Node::Icon(node) => &mut node.base,
        Node::Line(node) => &mut node.base,
        Node::ParametricGraph(node) => &mut node.base,
        Node::Rect(node) => &mut node.base,
        Node::Stack(node) => &mut node.base,
        Node::Text(node) => &mut node.base,
    }
}
