use std::collections::HashMap;
use std::hash::{DefaultHasher, Hash, Hasher};

use indexmap::IndexMap;

use crate::color;
use crate::layout;
use crate::schema::{Node, SceneEntry, TimelineEvent, VideoDescription};
use crate::scene::consts::DEFAULT_SCENE_BG;
use crate::scene::types::ResolvedNodeBatchKind;
use crate::text::TextMeasurer;

use super::segments::{ColorTrack, NumTrack};
use super::timeline::get_node_events;

const NUMERIC_TRACK_PROPERTIES: [&str; 22] = [
    "opacity",
    "x",
    "y",
    "dx",
    "dy",
    "width",
    "height",
    "radius",
    "x1",
    "y1",
    "x2",
    "y2",
    "rotate",
    "scale",
    "scaleX",
    "scaleY",
    "skewX",
    "skewY",
    "cornerRadius",
    "strokeWidth",
    "size",
    "drawProgress",
];

const COLOR_TRACK_PROPERTIES: [&str; 3] = ["fill", "stroke", "color"];

#[derive(Default)]
pub(super) struct NodeTracks {
    colors: HashMap<&'static str, ColorTrack>,
    numeric: HashMap<&'static str, NumTrack>,
}

pub struct CompiledVideo<'a> {
    pub(super) background: (u8, u8, u8),
    pub(super) height: u32,
    pub(crate) scenes: Vec<PrecomputedScene<'a>>,
    pub(super) width: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct FrameRenderHint {
    pub can_reuse_rendered_frame: bool,
    pub scene_cache_key: u64,
}

pub(crate) struct PrecomputedScene<'a> {
    pub(super) background: (u8, u8, u8),
    pub(super) can_reuse_rendered_frame: bool,
    pub(super) cached_layout: Option<HashMap<String, layout::LayoutBox>>,
    pub(super) end_frame_exclusive: u32,
    pub(super) fps: f64,
    pub(super) node_tracks: HashMap<String, NodeTracks>,
    pub(super) nodes: &'a IndexMap<String, Node>,
    pub(super) render_batch_kinds: HashMap<String, ResolvedNodeBatchKind>,
    pub(super) render_cache_key: u64,
    pub(super) start_frame: u32,
}

impl NodeTracks {
    pub(super) fn compile(events: &[TimelineEvent]) -> Self {
        let numeric = NUMERIC_TRACK_PROPERTIES
            .into_iter()
            .filter_map(|property| {
                NumTrack::compile(events, property).map(|track| (property, track))
            })
            .collect();
        let colors = COLOR_TRACK_PROPERTIES
            .into_iter()
            .filter_map(|property| {
                ColorTrack::compile(events, property).map(|track| (property, track))
            })
            .collect();

        Self { colors, numeric }
    }

    pub(super) fn color(&self, property: &'static str, base: Option<&str>, t: f64) -> Option<String> {
        self.colors
            .get(property)
            .map_or_else(|| base.map(str::to_string), |track| track.resolve(base, t))
    }

    pub(super) fn num(&self, property: &'static str, base: f64, t: f64) -> f64 {
        self.numeric
            .get(property)
            .map_or(base, |track| track.resolve(base, t))
    }

    fn has_any(&self, properties: &[&'static str]) -> bool {
        properties.iter().any(|property| {
            self.numeric.contains_key(property) || self.colors.contains_key(property)
        })
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
        let node_tracks: HashMap<String, NodeTracks> = scene
            .nodes
            .keys()
            .map(|id| {
                let events = get_node_events(id, &scene.timeline);
                (id.clone(), NodeTracks::compile(&events))
            })
            .collect();
        let has_layout_nodes = scene.nodes.values().any(Node::is_layout);
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
        let render_batch_kinds = scene
            .nodes
            .iter()
            .filter_map(|(id, node)| {
                if node.is_layout() {
                    None
                } else {
                    let default_tracks = NodeTracks::default();
                    let tracks = node_tracks.get(id).unwrap_or(&default_tracks);
                    Some((
                        id.clone(),
                        classify_render_batch_kind(
                            node,
                            tracks,
                            has_layout_nodes,
                            cached_layout.is_some(),
                        ),
                    ))
                }
            })
            .collect();

        Ok(Self {
            background: color::parse_hex(bg_hex),
            can_reuse_rendered_frame: scene.timeline.is_empty(),
            cached_layout,
            end_frame_exclusive,
            fps: desc.fps,
            node_tracks,
            nodes: &scene.nodes,
            render_batch_kinds,
            render_cache_key: compute_scene_render_cache_key(scene),
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

pub fn frame_render_hint(compiled: &CompiledVideo<'_>, absolute_frame: u32) -> FrameRenderHint {
    let Some(scene) = scene_for_frame(compiled, absolute_frame) else {
        return FrameRenderHint {
            can_reuse_rendered_frame: false,
            scene_cache_key: 0,
        };
    };

    FrameRenderHint {
        can_reuse_rendered_frame: scene.can_reuse_rendered_frame,
        scene_cache_key: scene.render_cache_key,
    }
}

pub(super) fn scene_for_frame<'a>(
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

fn scene_has_static_layout(scene: &SceneEntry) -> bool {
    !scene.timeline.iter().any(event_affects_layout)
}

fn compute_scene_render_cache_key(scene: &SceneEntry) -> u64 {
    let mut hasher = DefaultHasher::new();
    scene.id.hash(&mut hasher);
    scene.start_frame.hash(&mut hasher);
    scene.duration.hash(&mut hasher);
    hasher.finish()
}

fn event_affects_layout(event: &TimelineEvent) -> bool {
    event.x.is_some()
        || event.y.is_some()
        || event.dx.is_some()
        || event.dy.is_some()
        || event.width.is_some()
        || event.height.is_some()
        || event.radius.is_some()
        || event.x1.is_some()
        || event.y1.is_some()
        || event.x2.is_some()
        || event.y2.is_some()
        || event.size.is_some()
}

fn classify_render_batch_kind(
    node: &Node,
    tracks: &NodeTracks,
    has_layout_nodes: bool,
    has_static_layout: bool,
) -> ResolvedNodeBatchKind {
    if matches!(node, Node::Line(line) if line.from.is_some() || line.to.is_some()) {
        return ResolvedNodeBatchKind::Dynamic;
    }

    if has_layout_nodes && !has_static_layout {
        return ResolvedNodeBatchKind::Dynamic;
    }

    const BASE_DYNAMIC_PROPS: [&str; 10] = [
        "opacity", "x", "y", "dx", "dy", "rotate", "scaleX", "scaleY", "skewX", "skewY",
    ];
    if tracks.has_any(&BASE_DYNAMIC_PROPS) {
        return ResolvedNodeBatchKind::Dynamic;
    }

    let node_dynamic_props: &[&str] = match node {
        Node::Circle(_) => &["radius", "strokeWidth", "drawProgress", "fill", "stroke"],
        Node::FunctionGraph(_) => &["drawProgress", "color", "strokeWidth"],
        Node::Icon(_) => &["width", "height", "strokeWidth", "fill", "stroke"],
        Node::Line(_) => &[
            "x1",
            "y1",
            "x2",
            "y2",
            "strokeWidth",
            "drawProgress",
            "stroke",
        ],
        Node::ParametricGraph(_) => &["drawProgress", "color", "strokeWidth"],
        Node::Rect(_) => &[
            "width",
            "height",
            "cornerRadius",
            "strokeWidth",
            "fill",
            "stroke",
        ],
        Node::Text(_) => &["size", "color"],
        _ => &[],
    };

    if tracks.has_any(node_dynamic_props) {
        ResolvedNodeBatchKind::Dynamic
    } else {
        ResolvedNodeBatchKind::Static
    }
}

#[cfg(test)]
mod tests {
    use indexmap::IndexMap;

    use super::compile_video;
    use crate::schema::{
        EventTarget, Node, NodeBase, RectNode, SceneEntry, TimelineEvent, VideoDescription,
    };
    use crate::text::SkiaTextMeasurer;

    #[test]
    fn compile_video_should_interpolate_draw_progress_tracks() {
        let mut nodes = IndexMap::new();
        nodes.insert(
            "rect".to_string(),
            Node::Rect(RectNode {
                base: NodeBase::default(),
                width: 64.0,
                height: 32.0,
                fill: Some("#000000".to_string()),
                stroke: None,
                stroke_width: None,
                corner_radius: None,
            }),
        );

        let desc = VideoDescription {
            fps: 30.0,
            width: 320,
            height: 180,
            background: Some("#ffffff".to_string()),
            scenes: vec![SceneEntry {
                id: "scene-1".to_string(),
                background: None,
                duration: 30,
                start_frame: 0,
                nodes,
                timeline: vec![TimelineEvent {
                    target: EventTarget::Single("rect".to_string()),
                    at: 0.0,
                    dur: Some(1.0),
                    ease: Some(crate::schema::Easing::EaseOut),
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
                }],
            }],
        };
        let measurer = SkiaTextMeasurer::new();
        let compiled = compile_video(&desc, &measurer).expect("video should compile");
        let tracks = compiled.scenes[0]
            .node_tracks
            .get("rect")
            .expect("rect tracks should exist");
        let draw_progress = tracks.num("drawProgress", 0.0, 0.5);

        assert!((draw_progress - 0.75).abs() < 1e-9);
    }
}
