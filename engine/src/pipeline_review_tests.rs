use indexmap::IndexMap;

use crate::animation::{compile_video, total_frame_count};
use crate::schema::{
    AlignNode,
    Anchor,
    Node,
    NodeBase,
    RectNode,
    SceneEntry,
    VideoDescription,
};
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

    assert_eq!(result, Err("scene scene-1 has invalid duration 0".to_string()));
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
