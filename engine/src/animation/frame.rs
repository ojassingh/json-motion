use std::collections::HashMap;

use indexmap::IndexMap;
use skia_safe::Typeface;

use crate::color;
use crate::layout;
use crate::shared::consts::{
    DEFAULT_FONT_SIZE,
    DEFAULT_LINE_HEIGHT_MULT,
    DEFAULT_SCENE_BG,
    DEFAULT_TEXT_COLOR,
};
use crate::shared::types::{
    ResolvedFrame,
    ResolvedIcon,
    ResolvedNode,
    ResolvedNodeData,
    ResolvedRect,
    ResolvedText,
};
use crate::schema::{
    IconLineCap,
    IconLineJoin,
    Node,
    NodeBase,
    SceneEntry,
    TextAlign,
    TimelineEvent,
    VideoDescription,
};

use super::segments::{color_at, num_at};
use super::timeline::get_node_events;

pub struct PrecomputedScene<'a> {
    pub(super) start_frame: u32,
    pub(super) end_frame_exclusive: u32,
    pub(super) fps: f64,
    pub(super) background: (u8, u8, u8),
    pub(super) nodes: &'a IndexMap<String, Node>,
    pub(super) node_events: HashMap<String, Vec<TimelineEvent>>,
}

impl<'a> PrecomputedScene<'a> {
    pub fn new(scene: &'a SceneEntry, desc: &VideoDescription) -> Result<Self, String> {
        if scene.duration == 0 {
            return Err(format!("scene {} has invalid duration 0", scene.id));
        }
        let end_frame_exclusive = scene
            .start_frame
            .checked_add(scene.duration)
            .ok_or_else(|| format!("scene {} frame range overflowed", scene.id))?;
        let node_events = scene
            .nodes
            .keys()
            .map(|id| (id.clone(), get_node_events(id, &scene.timeline)))
            .collect();
        let bg_hex = scene
            .background
            .as_deref()
            .or(desc.background.as_deref())
            .unwrap_or(DEFAULT_SCENE_BG);

        Ok(Self {
            start_frame: scene.start_frame,
            end_frame_exclusive,
            fps: desc.fps,
            background: color::parse_hex(bg_hex),
            nodes: &scene.nodes,
            node_events,
        })
    }
}

fn snapshot_nodes(
    nodes: &IndexMap<String, Node>,
    node_events: &HashMap<String, Vec<TimelineEvent>>,
    t: f64,
) -> IndexMap<String, Node> {
    let mut snapshot = nodes.clone();

    for (id, node) in &mut snapshot {
        let events = node_events.get(id).map(Vec::as_slice).unwrap_or(&[]);
        apply_base(node, events, t);
        apply_node_data(node, events, t);
    }

    snapshot
}

fn apply_base(node: &mut Node, events: &[TimelineEvent], t: f64) {
    let base = base_mut(node);
    let x = num_at(events, "x", base.x.unwrap_or(0.0), t);
    let y = num_at(events, "y", base.y.unwrap_or(0.0), t);
    base.x = Some(x + num_at(events, "dx", 0.0, t));
    base.y = Some(y + num_at(events, "dy", 0.0, t));
    base.opacity = Some(num_at(events, "opacity", base.opacity.unwrap_or(1.0), t));
    base.rotate = Some(num_at(events, "rotate", base.rotate.unwrap_or(0.0), t));
    base.scale_x = Some(num_at(
        events,
        "scaleX",
        base.scale_x.unwrap_or(base.scale.unwrap_or(1.0)),
        t,
    ));
    base.scale_y = Some(num_at(
        events,
        "scaleY",
        base.scale_y.unwrap_or(base.scale.unwrap_or(1.0)),
        t,
    ));
    base.skew_x = Some(num_at(events, "skewX", base.skew_x.unwrap_or(0.0), t));
    base.skew_y = Some(num_at(events, "skewY", base.skew_y.unwrap_or(0.0), t));
}

fn apply_node_data(node: &mut Node, events: &[TimelineEvent], t: f64) {
    match node {
        Node::Icon(icon) => {
            icon.width = num_at(events, "width", icon.width, t);
            icon.height = num_at(events, "height", icon.height, t);
            icon.fill = color_at(events, "fill", icon.fill.as_deref(), t);
            icon.stroke = color_at(
                events,
                "stroke",
                Some(icon.stroke.as_deref().unwrap_or(DEFAULT_TEXT_COLOR)),
                t,
            );
            icon.stroke_width = Some(num_at(
                events,
                "strokeWidth",
                icon.stroke_width.unwrap_or(2.0),
                t,
            ));
        }
        Node::Rect(rect) => {
            rect.width = num_at(events, "width", rect.width, t);
            rect.height = num_at(events, "height", rect.height, t);
            rect.fill = color_at(events, "fill", rect.fill.as_deref(), t);
            rect.stroke = color_at(events, "stroke", rect.stroke.as_deref(), t);
            rect.stroke_width = Some(num_at(
                events,
                "strokeWidth",
                rect.stroke_width.unwrap_or(0.0),
                t,
            ));
            rect.corner_radius = Some(num_at(
                events,
                "cornerRadius",
                rect.corner_radius.unwrap_or(0.0),
                t,
            ));
        }
        Node::Text(text) => {
            let font_size = num_at(events, "size", text.size.unwrap_or(DEFAULT_FONT_SIZE), t);
            text.size = Some(font_size);
            text.color = color_at(
                events,
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
        Node::Center(node) => &mut node.base,
        Node::Icon(node) => &mut node.base,
        Node::Rect(node) => &mut node.base,
        Node::Stack(node) => &mut node.base,
        Node::Text(node) => &mut node.base,
    }
}

fn resolve_node(node: &Node, layout_pos: (f64, f64), source_index: usize) -> Option<ResolvedNode> {
    let base = node.base();
    let scale = base.scale.unwrap_or(1.0);
    let common = |data: ResolvedNodeData| ResolvedNode {
        data,
        x: layout_pos.0,
        y: layout_pos.1,
        opacity: base.opacity.unwrap_or(1.0),
        rotation: base.rotate.unwrap_or(0.0),
        scale_x: base.scale_x.unwrap_or(scale),
        scale_y: base.scale_y.unwrap_or(scale),
        skew_x: base.skew_x.unwrap_or(0.0),
        skew_y: base.skew_y.unwrap_or(0.0),
        z_index: base.z_index.unwrap_or(0),
        source_index,
    };

    match node {
        Node::Icon(icon) => {
            let stroke_hex = icon
                .stroke
                .as_deref()
                .unwrap_or(DEFAULT_TEXT_COLOR);
            Some(common(ResolvedNodeData::Icon(ResolvedIcon {
                width: icon.width,
                height: icon.height,
                viewport_width: icon.viewport_width.unwrap_or(24.0),
                viewport_height: icon.viewport_height.unwrap_or(24.0),
                stroke: color::parse_hex(stroke_hex),
                fill: icon.fill.as_deref().map(color::parse_hex),
                stroke_width: icon.stroke_width.unwrap_or(2.0),
                absolute_stroke_width: icon.absolute_stroke_width.unwrap_or(false),
                line_cap: icon.line_cap.unwrap_or(IconLineCap::Round),
                line_join: icon.line_join.unwrap_or(IconLineJoin::Round),
                elements: icon.elements.clone(),
            })))
        }
        Node::Rect(rect) => Some(common(ResolvedNodeData::Rect(ResolvedRect {
            width: rect.width,
            height: rect.height,
            fill: rect.fill.as_deref().map(color::parse_hex),
            stroke: rect.stroke.as_deref().map(color::parse_hex),
            stroke_width: rect.stroke_width.unwrap_or(0.0),
            corner_radius: rect.corner_radius.unwrap_or(0.0),
        }))),
        Node::Text(text) => {
            let font_size = text.size.unwrap_or(DEFAULT_FONT_SIZE);
            let color_hex = text
                .color
                .as_deref()
                .unwrap_or(DEFAULT_TEXT_COLOR);
            Some(common(ResolvedNodeData::Text(ResolvedText {
                text: text.text.clone(),
                color: color::parse_hex(color_hex),
                font_family: text.font_family.clone(),
                font_size,
                line_height: text
                    .line_height
                    .unwrap_or(font_size * DEFAULT_LINE_HEIGHT_MULT),
                max_width: text.max_width,
                text_align: text.text_align.unwrap_or(TextAlign::Left),
            })))
        }
        _ => None,
    }
}

pub fn resolve_frame_fast(
    desc: &VideoDescription,
    absolute_frame: u32,
    scenes: &[PrecomputedScene<'_>],
    default_typeface: Option<&Typeface>,
) -> Result<ResolvedFrame, String> {
    let Some(precomp) = scenes
        .iter()
        .find(|s| absolute_frame >= s.start_frame && absolute_frame < s.end_frame_exclusive)
    else {
        return Ok(ResolvedFrame {
            background: color::parse_hex(
                desc.background.as_deref().unwrap_or(DEFAULT_SCENE_BG),
            ),
            nodes: vec![],
        });
    };

    let t = (absolute_frame - precomp.start_frame) as f64 / precomp.fps;
    let snapshot = snapshot_nodes(precomp.nodes, &precomp.node_events, t);
    let layout = layout::resolve_layout(
        &snapshot,
        desc.width as f64,
        desc.height as f64,
        default_typeface,
    )?;

    let mut nodes = Vec::with_capacity(snapshot.len());
    for (source_index, (id, node)) in snapshot.iter().enumerate() {
        let pos = layout
            .get(id)
            .copied()
            .ok_or_else(|| format!("missing layout position for node {id}"))?;
        if let Some(resolved) = resolve_node(node, pos, source_index) {
            nodes.push(resolved);
        }
    }

    nodes.sort_by(|a, b| {
        a.z_index
            .cmp(&b.z_index)
            .then(a.source_index.cmp(&b.source_index))
    });

    Ok(ResolvedFrame {
        background: precomp.background,
        nodes,
    })
}
