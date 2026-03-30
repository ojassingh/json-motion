use std::collections::HashMap;

use indexmap::IndexMap;

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
use crate::text::TextMeasurer;
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

use super::segments::{ColorTrack, NumTrack};
use super::timeline::get_node_events;

const NUMERIC_TRACK_PROPERTIES: [&str; 16] = [
    "opacity",
    "x",
    "y",
    "dx",
    "dy",
    "width",
    "height",
    "rotate",
    "scale",
    "scaleX",
    "scaleY",
    "skewX",
    "skewY",
    "cornerRadius",
    "strokeWidth",
    "size",
];

const COLOR_TRACK_PROPERTIES: [&str; 3] = ["fill", "stroke", "color"];

#[derive(Default)]
struct NodeTracks {
    colors: HashMap<&'static str, ColorTrack>,
    numeric: HashMap<&'static str, NumTrack>,
}

pub struct CompiledVideo<'a> {
    pub(crate) background: (u8, u8, u8),
    pub(crate) height: u32,
    pub(crate) scenes: Vec<PrecomputedScene<'a>>,
    pub(crate) width: u32,
}

pub struct PrecomputedScene<'a> {
    pub(crate) background: (u8, u8, u8),
    pub(crate) cached_layout: Option<HashMap<String, (f64, f64)>>,
    pub(crate) end_frame_exclusive: u32,
    pub(crate) fps: f64,
    node_tracks: HashMap<String, NodeTracks>,
    pub(crate) nodes: &'a IndexMap<String, Node>,
    pub(crate) start_frame: u32,
}

impl NodeTracks {
    fn compile(events: &[TimelineEvent]) -> Self {
        let numeric = NUMERIC_TRACK_PROPERTIES
            .into_iter()
            .filter_map(|property| NumTrack::compile(events, property).map(|track| (property, track)))
            .collect();
        let colors = COLOR_TRACK_PROPERTIES
            .into_iter()
            .filter_map(|property| ColorTrack::compile(events, property).map(|track| (property, track)))
            .collect();

        Self { colors, numeric }
    }

    fn color(&self, property: &'static str, base: Option<&str>, t: f64) -> Option<String> {
        self.colors
            .get(property)
            .map_or_else(|| base.map(str::to_string), |track| track.resolve(base, t))
    }

    fn num(&self, property: &'static str, base: f64, t: f64) -> f64 {
        self.numeric
            .get(property)
            .map_or(base, |track| track.resolve(base, t))
    }
}

impl<'a> PrecomputedScene<'a> {
    fn compile(
        scene: &'a SceneEntry,
        desc: &VideoDescription,
        measurer: &impl TextMeasurer,
    ) -> Result<Self, String> {
        if scene.duration == 0 {
            return Err(format!("scene {} has invalid duration 0", scene.id));
        }

        let end_frame_exclusive = scene
            .start_frame
            .checked_add(scene.duration)
            .ok_or_else(|| format!("scene {} frame range overflowed", scene.id))?;
        let node_tracks = scene
            .nodes
            .keys()
            .map(|id| {
                let events = get_node_events(id, &scene.timeline);
                (id.clone(), NodeTracks::compile(&events))
            })
            .collect();
        let bg_hex = scene
            .background
            .as_deref()
            .or(desc.background.as_deref())
            .unwrap_or(DEFAULT_SCENE_BG);
        let cached_layout = if scene_has_static_layout(scene) {
            Some(layout::resolve_layout(
                &scene.nodes,
                desc.width as f64,
                desc.height as f64,
                measurer,
            )?)
        } else {
            None
        };

        Ok(Self {
            background: color::parse_hex(bg_hex),
            cached_layout,
            end_frame_exclusive,
            fps: desc.fps,
            node_tracks,
            nodes: &scene.nodes,
            start_frame: scene.start_frame,
        })
    }

    #[cfg(test)]
    pub(crate) fn has_static_layout(&self) -> bool {
        self.cached_layout.is_some()
    }
}

pub fn compile_video<'a>(
    desc: &'a VideoDescription,
    measurer: &impl TextMeasurer,
) -> Result<CompiledVideo<'a>, String> {
    let scenes = desc
        .scenes
        .iter()
        .map(|scene| PrecomputedScene::compile(scene, desc, measurer))
        .collect::<Result<Vec<_>, _>>()?;

    Ok(CompiledVideo {
        background: color::parse_hex(desc.background.as_deref().unwrap_or(DEFAULT_SCENE_BG)),
        height: desc.height,
        scenes,
        width: desc.width,
    })
}

fn scene_has_static_layout(scene: &SceneEntry) -> bool {
    !scene.timeline.iter().any(event_affects_layout)
}

fn event_affects_layout(event: &TimelineEvent) -> bool {
    event.x.is_some()
        || event.y.is_some()
        || event.dx.is_some()
        || event.dy.is_some()
        || event.width.is_some()
        || event.height.is_some()
        || event.size.is_some()
}

fn scene_for_frame<'a>(
    compiled: &'a CompiledVideo<'a>,
    absolute_frame: u32,
) -> Option<&'a PrecomputedScene<'a>> {
    let idx = compiled
        .scenes
        .partition_point(|scene| scene.end_frame_exclusive <= absolute_frame);
    compiled
        .scenes
        .get(idx)
        .filter(|scene| absolute_frame >= scene.start_frame)
}

fn snapshot_nodes(
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
        Node::Icon(icon) => {
            icon.width = tracks.num("width", icon.width, t);
            icon.height = tracks.num("height", icon.height, t);
            icon.fill = tracks.color("fill", icon.fill.as_deref(), t);
            icon.stroke = tracks.color(
                "stroke",
                Some(icon.stroke.as_deref().unwrap_or(DEFAULT_TEXT_COLOR)),
                t,
            );
            icon.stroke_width = Some(tracks.num(
                "strokeWidth",
                icon.stroke_width.unwrap_or(2.0),
                t,
            ));
        }
        Node::Rect(rect) => {
            rect.width = tracks.num("width", rect.width, t);
            rect.height = tracks.num("height", rect.height, t);
            rect.fill = tracks.color("fill", rect.fill.as_deref(), t);
            rect.stroke = tracks.color("stroke", rect.stroke.as_deref(), t);
            rect.stroke_width = Some(tracks.num(
                "strokeWidth",
                rect.stroke_width.unwrap_or(0.0),
                t,
            ));
            rect.corner_radius = Some(tracks.num(
                "cornerRadius",
                rect.corner_radius.unwrap_or(0.0),
                t,
            ));
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
        Node::Center(node) => &mut node.base,
        Node::Icon(node) => &mut node.base,
        Node::Rect(node) => &mut node.base,
        Node::Stack(node) => &mut node.base,
        Node::Text(node) => &mut node.base,
    }
}

fn resolve_common(
    base: &NodeBase,
    tracks: &NodeTracks,
    layout_pos: (f64, f64),
    source_index: usize,
    t: f64,
    data: ResolvedNodeData,
) -> ResolvedNode {
    let scale = base.scale.unwrap_or(1.0);
    ResolvedNode {
        data,
        opacity: tracks.num("opacity", base.opacity.unwrap_or(1.0), t),
        rotation: tracks.num("rotate", base.rotate.unwrap_or(0.0), t),
        scale_x: tracks.num("scaleX", base.scale_x.unwrap_or(scale), t),
        scale_y: tracks.num("scaleY", base.scale_y.unwrap_or(scale), t),
        skew_x: tracks.num("skewX", base.skew_x.unwrap_or(0.0), t),
        skew_y: tracks.num("skewY", base.skew_y.unwrap_or(0.0), t),
        source_index,
        x: layout_pos.0,
        y: layout_pos.1,
        z_index: base.z_index.unwrap_or(0),
    }
}

fn resolve_node(
    node: &Node,
    tracks: &NodeTracks,
    layout_pos: (f64, f64),
    source_index: usize,
    t: f64,
) -> Option<ResolvedNode> {
    match node {
        Node::Icon(icon) => {
            let stroke_hex = tracks
                .color(
                    "stroke",
                    Some(icon.stroke.as_deref().unwrap_or(DEFAULT_TEXT_COLOR)),
                    t,
                )
                .unwrap_or_else(|| DEFAULT_TEXT_COLOR.to_string());
            Some(resolve_common(
                &icon.base,
                tracks,
                layout_pos,
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
            ))
        }
        Node::Rect(rect) => Some(resolve_common(
            &rect.base,
            tracks,
            layout_pos,
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
        )),
        Node::Text(text) => {
            let font_size = tracks.num("size", text.size.unwrap_or(DEFAULT_FONT_SIZE), t);
            let color_hex = tracks
                .color(
                    "color",
                    Some(text.color.as_deref().unwrap_or(DEFAULT_TEXT_COLOR)),
                    t,
                )
                .unwrap_or_else(|| DEFAULT_TEXT_COLOR.to_string());
            Some(resolve_common(
                &text.base,
                tracks,
                layout_pos,
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
            ))
        }
        _ => None,
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

    let mut nodes = Vec::with_capacity(nodes_ref.len());
    for (source_index, (id, node)) in nodes_ref.iter().enumerate() {
        let pos = layout_positions
            .get(id)
            .copied()
            .ok_or_else(|| format!("missing layout position for node {id}"))?;
        let default_tracks = NodeTracks::default();
        let tracks = scene.node_tracks.get(id).unwrap_or(&default_tracks);
        if let Some(resolved) = resolve_node(node, tracks, pos, source_index, t) {
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
    })
}
