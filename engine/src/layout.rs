use std::collections::{HashMap, HashSet};

use taffy::prelude::*;

use crate::schema::{Anchor, Node, StackAlign, StackDirection};
use crate::text::TextMeasurer;

#[derive(Clone, Copy, Debug)]
pub struct LayoutBox {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

fn roots(nodes: &indexmap::IndexMap<String, Node>) -> Vec<String> {
    let mut child_ids = HashSet::new();
    for node in nodes.values() {
        for child_id in node.children() {
            child_ids.insert(child_id.as_str());
        }
    }
    nodes
        .keys()
        .filter(|id| !child_ids.contains(id.as_str()))
        .cloned()
        .collect()
}

fn fixed_size(width: f64, height: f64) -> Size<Dimension> {
    Size {
        width: length(width as f32),
        height: length(height as f32),
    }
}

fn optional_size(width: Option<f64>, height: Option<f64>, fill_parent: bool) -> Size<Dimension> {
    let auto_or_fill = |value: Option<f64>| match value {
        Some(value) => length(value as f32),
        None if fill_parent => percent(1.0),
        None => auto(),
    };
    Size {
        width: auto_or_fill(width),
        height: auto_or_fill(height),
    }
}

fn gap_size(direction: StackDirection, gap: f64) -> Size<LengthPercentage> {
    match direction {
        StackDirection::Horizontal => Size {
            width: length(gap as f32),
            height: zero(),
        },
        StackDirection::Vertical => Size {
            width: zero(),
            height: length(gap as f32),
        },
    }
}

fn stack_alignment(align: Option<StackAlign>) -> Option<AlignItems> {
    match align.unwrap_or(StackAlign::Center) {
        StackAlign::Start => Some(AlignItems::Start),
        StackAlign::Center => Some(AlignItems::Center),
        StackAlign::End => Some(AlignItems::End),
    }
}

fn anchor_to_flex(anchor: Anchor) -> (JustifyContent, AlignItems) {
    let justify = match anchor {
        Anchor::TopLeft | Anchor::CenterLeft | Anchor::BottomLeft => JustifyContent::Start,
        Anchor::TopCenter | Anchor::Center | Anchor::BottomCenter => JustifyContent::Center,
        Anchor::TopRight | Anchor::CenterRight | Anchor::BottomRight => JustifyContent::End,
    };
    let align = match anchor {
        Anchor::TopLeft | Anchor::TopCenter | Anchor::TopRight => AlignItems::Start,
        Anchor::CenterLeft | Anchor::Center | Anchor::CenterRight => AlignItems::Center,
        Anchor::BottomLeft | Anchor::BottomCenter | Anchor::BottomRight => AlignItems::End,
    };
    (justify, align)
}

fn style_for_node(node: &Node, is_root: bool, measurer: &impl TextMeasurer) -> Style {
    let mut style = Style::default();
    if is_root {
        style.position = Position::Absolute;
    }

    match node {
        Node::Rect(node) => {
            style.size = fixed_size(node.width, node.height);
        }
        Node::Arrow(_) => {
            style.size = fixed_size(0.0, 0.0);
        }
        Node::Circle(node) => {
            let diameter = node.radius * 2.0;
            style.size = fixed_size(diameter, diameter);
        }
        Node::Icon(node) => {
            style.size = fixed_size(node.width, node.height);
        }
        Node::Line(node) => {
            style.size = fixed_size((node.x2 - node.x1).abs(), (node.y2 - node.y1).abs());
        }
        Node::Text(node) => {
            let measured = measurer.measure_text_node(node);
            style.size = fixed_size(measured.width, measured.height);
        }
        Node::Center(node) => {
            style.display = Display::Flex;
            style.justify_content = Some(JustifyContent::Center);
            style.align_items = Some(AlignItems::Center);
            style.size = optional_size(node.width, node.height, true);
        }
        Node::Align(node) => {
            let padding = node.padding.unwrap_or(0.0) as f32;
            let (justify, align) = anchor_to_flex(node.position);
            style.display = Display::Flex;
            style.justify_content = Some(justify);
            style.align_items = Some(align);
            style.size = optional_size(node.width, node.height, true);
            style.padding = Rect {
                left: length(padding),
                right: length(padding),
                top: length(padding),
                bottom: length(padding),
            };
        }
        Node::Stack(node) => {
            style.display = Display::Flex;
            style.flex_direction = match node.direction {
                StackDirection::Horizontal => FlexDirection::Row,
                StackDirection::Vertical => FlexDirection::Column,
            };
            style.align_items = stack_alignment(node.align);
            style.gap = gap_size(node.direction, node.gap.unwrap_or(0.0));
            style.size = optional_size(node.width, node.height, false);
        }
    }

    style
}

fn build_tree(
    id: &str,
    is_root: bool,
    nodes: &indexmap::IndexMap<String, Node>,
    measurer: &impl TextMeasurer,
    tree: &mut TaffyTree<()>,
    built: &mut HashMap<String, NodeId>,
    visiting: &mut HashSet<String>,
) -> Result<NodeId, String> {
    if let Some(node_id) = built.get(id) {
        return Ok(*node_id);
    }
    if !visiting.insert(id.to_string()) {
        return Err(format!("circular child reference detected at {id}"));
    }
    let node = nodes
        .get(id)
        .ok_or_else(|| format!("missing node {id} during layout"))?;
    let mut child_nodes = Vec::with_capacity(node.children().len());
    for child_id in node.children() {
        child_nodes.push(build_tree(
            child_id, false, nodes, measurer, tree, built, visiting,
        )?);
    }

    visiting.remove(id);
    let style = style_for_node(node, is_root, measurer);
    let node_id = if child_nodes.is_empty() {
        tree.new_leaf(style)
            .map_err(|error| format!("failed to create layout leaf {id}: {error}"))?
    } else {
        tree.new_with_children(style, &child_nodes)
            .map_err(|error| format!("failed to create layout node {id}: {error}"))?
    };
    built.insert(id.to_string(), node_id);
    Ok(node_id)
}

fn collect_positions(
    id: &str,
    parent_pos: (f64, f64),
    nodes: &indexmap::IndexMap<String, Node>,
    tree: &TaffyTree<()>,
    built: &HashMap<String, NodeId>,
    positions: &mut HashMap<String, LayoutBox>,
) -> Result<(), String> {
    let node = nodes
        .get(id)
        .ok_or_else(|| format!("missing node {id} during layout collection"))?;
    let node_id = built
        .get(id)
        .ok_or_else(|| format!("missing taffy node for {id}"))?;
    let layout = tree
        .layout(*node_id)
        .map_err(|error| format!("failed to read layout for {id}: {error}"))?;
    let pos = (
        parent_pos.0 + layout.location.x as f64 + node.base().x.unwrap_or(0.0),
        parent_pos.1 + layout.location.y as f64 + node.base().y.unwrap_or(0.0),
    );
    positions.insert(
        id.to_string(),
        LayoutBox {
            x: pos.0,
            y: pos.1,
            width: layout.size.width as f64,
            height: layout.size.height as f64,
        },
    );

    for child_id in node.children() {
        collect_positions(child_id, pos, nodes, tree, built, positions)?;
    }
    Ok(())
}

pub fn resolve_layout(
    nodes: &indexmap::IndexMap<String, Node>,
    frame_w: f64,
    frame_h: f64,
    measurer: &impl TextMeasurer,
) -> Result<HashMap<String, LayoutBox>, String> {
    let mut positions = HashMap::new();
    let root_ids = roots(nodes);
    if !nodes.is_empty() && root_ids.is_empty() {
        return Err("scene nodes must form a rooted tree".to_string());
    }
    let mut tree: TaffyTree<()> = TaffyTree::new();
    let mut built = HashMap::new();
    let mut visiting = HashSet::new();

    let mut root_children = Vec::with_capacity(root_ids.len());
    for root_id in &root_ids {
        let node_id = build_tree(
            root_id,
            true,
            nodes,
            measurer,
            &mut tree,
            &mut built,
            &mut visiting,
        )?;
        root_children.push(node_id);
    }

    let root = tree
        .new_with_children(
            Style {
                size: fixed_size(frame_w, frame_h),
                ..Default::default()
            },
            &root_children,
        )
        .map_err(|error| format!("failed to create root layout node: {error}"))?;

    tree.compute_layout(root, Size::MAX_CONTENT)
        .map_err(|error| format!("failed to compute layout: {error}"))?;

    for root_id in &root_ids {
        collect_positions(root_id, (0.0, 0.0), nodes, &tree, &built, &mut positions)?;
    }

    Ok(positions)
}
