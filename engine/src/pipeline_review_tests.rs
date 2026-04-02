use indexmap::IndexMap;

use crate::animation::{compile_video, frame_render_hint, resolve_frame_fast, total_frame_count};
use crate::schema::{
    AlignNode, Anchor, LineEndpoint, LineEndpointTarget, LineHead, LineNode, Node, NodeBase,
    RectNode, SceneEntry, VideoDescription,
};
use crate::scene::types::{ResolvedNodeBatchKind, ResolvedNodeData};
use crate::text::SkiaTextMeasurer;

fn video_with_scene(scene: SceneEntry) -> VideoDescription {
    VideoDescription {
        fps: 30.0,
        width: 320,
        height: 180,
        background: Some("#ffffff".to_string()),
        scenes: vec![scene],
    }
}

#[test]
fn resolve_frame_fast_should_return_error_when_layout_resolution_fails() {
    let mut nodes = IndexMap::new();
    nodes.insert(
        "rect".to_string(),
        Node::Rect(RectNode {
            base: NodeBase {
                x: Some(48.0),
                y: Some(24.0),
                ..NodeBase::default()
            },
            width: 32.0,
            height: 32.0,
            fill: Some("#000000".to_string()),
            stroke: None,
            stroke_width: None,
            corner_radius: None,
        }),
    );
    nodes.insert(
        "align".to_string(),
        Node::Align(AlignNode {
            base: NodeBase::default(),
            children: vec!["missing".to_string(), "rect".to_string()],
            position: Anchor::Center,
            padding: None,
            width: None,
            height: None,
        }),
    );

    let scene = SceneEntry {
        id: "scene-1".to_string(),
        background: None,
        duration: 1,
        start_frame: 0,
        nodes,
        timeline: vec![],
    };
    let desc = video_with_scene(scene);
    let measurer = SkiaTextMeasurer::new();
    let result = compile_video(&desc, &measurer);

    assert!(result.is_err());
}

#[test]
fn video_description_deserialization_should_reject_unsupported_image_nodes() {
    let json = r##"
    {
      "fps": 60,
      "width": 320,
      "height": 180,
      "scenes": [
        {
          "id": "scene-1",
          "duration": 1,
          "startFrame": 0,
          "nodes": {
            "image": {
              "type": "image",
              "width": 120,
              "height": 80,
              "src": "https://example.com/image.png"
            }
          }
        }
      ]
    }
    "##;

    let result = serde_json::from_str::<VideoDescription>(json);

    assert!(result.is_err());
}

#[test]
fn resolve_frame_fast_should_return_error_for_reachable_child_cycles() {
    let mut nodes = IndexMap::new();
    nodes.insert(
        "align".to_string(),
        Node::Align(AlignNode {
            base: NodeBase::default(),
            children: vec!["stack".to_string()],
            position: Anchor::Center,
            padding: None,
            width: None,
            height: None,
        }),
    );
    nodes.insert(
        "stack".to_string(),
        Node::Stack(crate::schema::StackNode {
            base: NodeBase::default(),
            children: vec!["align".to_string()],
            direction: crate::schema::StackDirection::Vertical,
            gap: None,
            align: None,
            width: None,
            height: None,
        }),
    );

    let scene = SceneEntry {
        id: "scene-1".to_string(),
        background: None,
        duration: 1,
        start_frame: 0,
        nodes,
        timeline: vec![],
    };
    let desc = video_with_scene(scene);
    let measurer = SkiaTextMeasurer::new();
    let result = compile_video(&desc, &measurer);

    assert!(result.is_err());
}

#[test]
fn total_frame_count_should_return_error_for_zero_duration_scene() {
    let scene = SceneEntry {
        id: "scene-1".to_string(),
        background: None,
        duration: 0,
        start_frame: 0,
        nodes: IndexMap::new(),
        timeline: vec![],
    };
    let desc = video_with_scene(scene);

    let result = total_frame_count(&desc);

    assert_eq!(
        result,
        Err("scene scene-1 has invalid duration 0".to_string())
    );
}

#[test]
fn compile_video_should_cache_layout_when_only_non_layout_props_animate() {
    let mut nodes = IndexMap::new();
    nodes.insert(
        "rect".to_string(),
        Node::Rect(RectNode {
            base: NodeBase::default(),
            width: 32.0,
            height: 32.0,
            fill: Some("#000000".to_string()),
            stroke: None,
            stroke_width: None,
            corner_radius: None,
        }),
    );
    nodes.insert(
        "center".to_string(),
        Node::Align(AlignNode {
            base: NodeBase::default(),
            children: vec!["rect".to_string()],
            position: Anchor::Center,
            padding: None,
            width: None,
            height: None,
        }),
    );
    let scene = SceneEntry {
        id: "scene-1".to_string(),
        background: None,
        duration: 60,
        start_frame: 0,
        nodes,
        timeline: vec![crate::schema::TimelineEvent {
            target: crate::schema::EventTarget::Single("rect".to_string()),
            at: 0.5,
            dur: Some(0.5),
            ease: None,
            action: None,
            opacity: Some(0.5),
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
            rotate: Some(45.0),
            scale: None,
            scale_x: None,
            scale_y: None,
            skew_x: None,
            skew_y: None,
            corner_radius: None,
            stroke_width: None,
            size: None,
            draw_progress: None,
            fill: None,
            stroke: None,
            color: None,
        }],
    };
    let desc = video_with_scene(scene);
    let measurer = SkiaTextMeasurer::new();
    let compiled = compile_video(&desc, &measurer).expect("video should compile");

    assert!(compiled.scenes[0].has_static_layout());
}

#[test]
fn resolve_frame_fast_should_mark_only_animated_absolute_nodes_as_dynamic() {
    let mut nodes = IndexMap::new();
    nodes.insert(
        "static_rect".to_string(),
        Node::Rect(RectNode {
            base: NodeBase {
                x: Some(16.0),
                y: Some(20.0),
                ..NodeBase::default()
            },
            width: 32.0,
            height: 32.0,
            fill: Some("#000000".to_string()),
            stroke: None,
            stroke_width: None,
            corner_radius: None,
        }),
    );
    nodes.insert(
        "animated_rect".to_string(),
        Node::Rect(RectNode {
            base: NodeBase {
                x: Some(72.0),
                y: Some(20.0),
                ..NodeBase::default()
            },
            width: 32.0,
            height: 32.0,
            fill: Some("#38bdf8".to_string()),
            stroke: None,
            stroke_width: None,
            corner_radius: None,
        }),
    );

    let scene = SceneEntry {
        id: "scene-1".to_string(),
        background: None,
        duration: 60,
        start_frame: 0,
        nodes,
        timeline: vec![crate::schema::TimelineEvent {
            target: crate::schema::EventTarget::Single("animated_rect".to_string()),
            at: 0.25,
            dur: Some(0.5),
            ease: None,
            action: None,
            opacity: None,
            x: None,
            y: None,
            dx: Some(12.0),
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
            draw_progress: None,
            fill: None,
            stroke: None,
            color: None,
        }],
    };
    let desc = video_with_scene(scene);
    let measurer = SkiaTextMeasurer::new();
    let compiled = compile_video(&desc, &measurer).expect("video should compile");
    let frame = resolve_frame_fast(&compiled, 0, &measurer).expect("frame should resolve");

    let static_node = frame
        .nodes
        .iter()
        .find(|node| node.source_index == 0)
        .expect("static node should exist");
    let animated_node = frame
        .nodes
        .iter()
        .find(|node| node.source_index == 1)
        .expect("animated node should exist");

    assert_eq!(static_node.batch_kind, ResolvedNodeBatchKind::Static);
    assert_eq!(animated_node.batch_kind, ResolvedNodeBatchKind::Dynamic);
}

#[test]
fn frame_render_hint_should_allow_reuse_for_static_scenes() {
    let scene = SceneEntry {
        id: "scene-1".to_string(),
        background: None,
        duration: 60,
        start_frame: 0,
        nodes: IndexMap::new(),
        timeline: vec![],
    };
    let desc = video_with_scene(scene);
    let measurer = SkiaTextMeasurer::new();
    let compiled = compile_video(&desc, &measurer).expect("video should compile");
    let hint = frame_render_hint(&compiled, 0);

    assert!(hint.can_reuse_rendered_frame);
    assert_ne!(hint.scene_cache_key, 0);
}

#[test]
fn frame_render_hint_should_disable_reuse_for_animated_scenes() {
    let scene = SceneEntry {
        id: "scene-1".to_string(),
        background: None,
        duration: 60,
        start_frame: 0,
        nodes: IndexMap::new(),
        timeline: vec![crate::schema::TimelineEvent {
            target: crate::schema::EventTarget::Single("missing".to_string()),
            at: 0.25,
            dur: Some(0.5),
            ease: None,
            action: None,
            opacity: Some(0.5),
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
            draw_progress: None,
            fill: None,
            stroke: None,
            color: None,
        }],
    };
    let desc = video_with_scene(scene);
    let measurer = SkiaTextMeasurer::new();
    let compiled = compile_video(&desc, &measurer).expect("video should compile");
    let hint = frame_render_hint(&compiled, 0);

    assert!(!hint.can_reuse_rendered_frame);
}

#[test]
fn resolve_frame_fast_should_track_line_endpoints_against_motion() {
    let mut nodes = IndexMap::new();
    nodes.insert(
        "label".to_string(),
        Node::Rect(RectNode {
            base: NodeBase {
                x: Some(40.0),
                y: Some(88.0),
                ..NodeBase::default()
            },
            width: 24.0,
            height: 24.0,
            fill: Some("#0f172a".to_string()),
            stroke: None,
            stroke_width: None,
            corner_radius: None,
        }),
    );
    nodes.insert(
        "box".to_string(),
        Node::Rect(RectNode {
            base: NodeBase {
                x: Some(120.0),
                y: Some(80.0),
                ..NodeBase::default()
            },
            width: 40.0,
            height: 40.0,
            fill: Some("#38bdf8".to_string()),
            stroke: None,
            stroke_width: None,
            corner_radius: None,
        }),
    );
    nodes.insert(
        "connector".to_string(),
        Node::Line(LineNode {
            base: NodeBase::default(),
            x1: None,
            y1: None,
            x2: None,
            y2: None,
            from: Some(LineEndpoint::NodeRef(LineEndpointTarget {
                node: "label".to_string(),
                anchor: Some(Anchor::CenterRight),
            })),
            to: Some(LineEndpoint::NodeRef(LineEndpointTarget {
                node: "box".to_string(),
                anchor: Some(Anchor::CenterLeft),
            })),
            stroke: Some("#f8fafc".to_string()),
            stroke_width: Some(4.0),
            cap: None,
            draw_progress: Some(1.0),
            head: Some(LineHead::End),
            head_size: Some(10.0),
        }),
    );

    let scene = SceneEntry {
        id: "scene-1".to_string(),
        background: None,
        duration: 60,
        start_frame: 0,
        nodes,
        timeline: vec![crate::schema::TimelineEvent {
            target: crate::schema::EventTarget::Single("box".to_string()),
            at: 0.0,
            dur: Some(0.5),
            ease: None,
            action: None,
            opacity: None,
            x: None,
            y: None,
            dx: Some(20.0),
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
            draw_progress: None,
            fill: None,
            stroke: None,
            color: None,
        }],
    };
    let desc = video_with_scene(scene);
    let measurer = SkiaTextMeasurer::new();
    let compiled = compile_video(&desc, &measurer).expect("video should compile");
    let start_frame =
        resolve_frame_fast(&compiled, 0, &measurer).expect("start frame should resolve");
    let moved_frame =
        resolve_frame_fast(&compiled, 15, &measurer).expect("moved frame should resolve");

    let start_line = start_frame
        .nodes
        .iter()
        .find_map(|node| match &node.data {
            ResolvedNodeData::Line(line) => Some((node, line)),
            _ => None,
        })
        .expect("expected line in start frame");
    let moved_line = moved_frame
        .nodes
        .iter()
        .find_map(|node| match &node.data {
            ResolvedNodeData::Line(line) => Some((node, line)),
            _ => None,
        })
        .expect("expected line in moved frame");

    assert_eq!(start_line.0.x, moved_line.0.x);
    assert_eq!(start_line.1.x1, moved_line.1.x1);
    assert_eq!(start_line.1.x2 + 20.0, moved_line.1.x2);
    assert_eq!(start_line.1.head, LineHead::End);
}
