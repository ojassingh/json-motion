use std::collections::HashMap;

use indexmap::IndexMap;

use crate::layout;
use crate::shared::consts::{DEFAULT_LINE_HEIGHT_MULT, DEFAULT_SCENE_BG, DEFAULT_TEXT_COLOR};
use crate::shared::types::{ResolvedFrame, ResolvedNode, ResolvedNodeData, ResolvedRect, ResolvedText};
use crate::schema::{Node, SceneEntry, TextAlign, TimelineEvent, VideoDescription};

use super::segments::{color_at, color_base, num_at, num_base};
use super::timeline::get_node_events;

/// Everything constant across frames for a single scene — layout and per-node
/// event lists are computed once and reused for every frame in the hot loop.
pub struct PrecomputedScene<'a> {
    pub(super) start_frame: u32,
    pub(super) end_frame: u32,
    pub(super) fps: f64,
    pub(super) background: String,
    pub(super) nodes: &'a IndexMap<String, Node>,
    pub(super) layout: HashMap<String, (f64, f64)>,
    pub(super) node_events: HashMap<String, Vec<TimelineEvent>>,
}

impl<'a> PrecomputedScene<'a> {
    pub fn new(scene: &'a SceneEntry, desc: &VideoDescription) -> Self {
        let layout =
            layout::resolve_layout(&scene.nodes, desc.width as f64, desc.height as f64);
        let node_events = scene
            .nodes
            .keys()
            .map(|id| (id.clone(), get_node_events(id, &scene.timeline)))
            .collect();
        let background = scene
            .background
            .clone()
            .or_else(|| desc.background.clone())
            .unwrap_or_else(|| DEFAULT_SCENE_BG.to_string());

        Self {
            start_frame: scene.start_frame,
            end_frame: scene.start_frame + scene.duration - 1,
            fps: desc.fps,
            background,
            nodes: &scene.nodes,
            layout,
            node_events,
        }
    }
}

fn resolve_node(
    node: &Node,
    layout_pos: (f64, f64),
    events: &[TimelineEvent],
    t: f64,
    source_index: usize,
) -> Option<ResolvedNode> {
    let n = |ev_prop: &str, base_prop: &str| -> f64 {
        num_at(events, ev_prop, num_base(node, base_prop), t)
    };
    let c = |prop: &str| -> Option<String> {
        color_at(events, prop, color_base(node, prop), t)
    };

    let x = num_at(events, "x", layout_pos.0, t);
    let y = num_at(events, "y", layout_pos.1, t);
    let dx = num_at(events, "dx", 0.0, t);
    let dy = num_at(events, "dy", 0.0, t);

    let common = |data: ResolvedNodeData| ResolvedNode {
        data,
        x: x + dx,
        y: y + dy,
        opacity: n("opacity", "opacity"),
        rotation: n("rotate", "rotation"),
        scale_x: n("scaleX", "scaleX"),
        scale_y: n("scaleY", "scaleY"),
        skew_x: n("skewX", "skewX"),
        skew_y: n("skewY", "skewY"),
        z_index: node.base().z_index.unwrap_or(0),
        source_index,
    };

    match node {
        Node::Rect(_) => Some(common(ResolvedNodeData::Rect(ResolvedRect {
            width: n("width", "width"),
            height: n("height", "height"),
            fill: c("fill"),
            stroke: c("stroke"),
            stroke_width: n("strokeWidth", "strokeWidth"),
            corner_radius: n("cornerRadius", "cornerRadius"),
        }))),
        Node::Text(text_node) => {
            let font_size = n("size", "fontSize");
            Some(common(ResolvedNodeData::Text(ResolvedText {
                text: text_node.text.clone(),
                color: c("color").unwrap_or_else(|| DEFAULT_TEXT_COLOR.to_string()),
                font_size,
                line_height: text_node
                    .line_height
                    .unwrap_or(font_size * DEFAULT_LINE_HEIGHT_MULT),
                max_width: text_node.max_width,
                text_align: text_node.text_align.unwrap_or(TextAlign::Left),
            })))
        }
        _ => None,
    }
}

/// Resolve a single frame using precomputed scene data — no layout or event
/// work inside the hot loop.
pub fn resolve_frame_fast(
    desc: &VideoDescription,
    absolute_frame: u32,
    scenes: &[PrecomputedScene<'_>],
) -> ResolvedFrame {
    let Some(precomp) = scenes
        .iter()
        .find(|s| absolute_frame >= s.start_frame && absolute_frame <= s.end_frame)
    else {
        return ResolvedFrame {
            background: desc
                .background
                .clone()
                .unwrap_or_else(|| DEFAULT_SCENE_BG.to_string()),
            nodes: vec![],
        };
    };

    let t = (absolute_frame - precomp.start_frame) as f64 / precomp.fps;

    let mut nodes = Vec::with_capacity(precomp.nodes.len());
    for (source_index, (id, node)) in precomp.nodes.iter().enumerate() {
        let pos = precomp.layout.get(id).copied().unwrap_or((0.0, 0.0));
        let events = precomp
            .node_events
            .get(id)
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        if let Some(resolved) = resolve_node(node, pos, events, t, source_index) {
            nodes.push(resolved);
        }
    }

    nodes.sort_by(|a, b| {
        a.z_index
            .cmp(&b.z_index)
            .then(a.source_index.cmp(&b.source_index))
    });

    ResolvedFrame {
        background: precomp.background.clone(),
        nodes,
    }
}
