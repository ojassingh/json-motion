use std::collections::{HashMap, HashSet};

use taffy::prelude::*;

use crate::schema::{Anchor, Node, StackAlign, StackDirection, TextNode};

const DEFAULT_FONT_SIZE: f64 = 48.0;
const DEFAULT_LINE_HEIGHT_MULT: f64 = 1.2;
const TEXT_WIDTH_FACTOR: f64 = 0.6;

#[derive(Clone, Copy)]
enum ParentKind {
    Root,
    Layout,
}

fn estimate_text_width(text: &str, font_size: f64) -> f64 {
    text.split('\n')
        .map(|line| line.chars().count() as f64 * font_size * TEXT_WIDTH_FACTOR)
        .fold(0.0, f64::max)
}

fn text_dimensions(text: &TextNode) -> (f64, f64) {
    let line_count = text.text.split('\n').count() as f64;
    let font_size = text.size.unwrap_or(DEFAULT_FONT_SIZE);
    let line_height = text
        .line_height
        .unwrap_or(font_size * DEFAULT_LINE_HEIGHT_MULT);
    let width = text
        .max_width
        .unwrap_or_else(|| estimate_text_width(&text.text, font_size));
    (width, line_count * line_height)
}

fn roots(nodes: &indexmap::IndexMap<String, Node>) -> Vec<String> {
    let mut child_ids = HashSet::new();
    for node in nodes.values() {
        for child_id in node.children() {
            child_ids.insert(child_id.as_str());
        }
    }
    nodes.keys()
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

fn justify_for_anchor(anchor: Anchor) -> Option<JustifyContent> {
    match anchor {
        Anchor::TopLeft | Anchor::CenterLeft | Anchor::BottomLeft => Some(JustifyContent::Start),
        Anchor::TopCenter | Anchor::Center | Anchor::BottomCenter => Some(JustifyContent::Center),
        Anchor::TopRight | Anchor::CenterRight | Anchor::BottomRight => Some(JustifyContent::End),
    }
}

fn align_for_anchor(anchor: Anchor) -> Option<AlignItems> {
    match anchor {
        Anchor::TopLeft | Anchor::TopCenter | Anchor::TopRight => Some(AlignItems::Start),
        Anchor::CenterLeft | Anchor::Center | Anchor::CenterRight => Some(AlignItems::Center),
        Anchor::BottomLeft | Anchor::BottomCenter | Anchor::BottomRight => Some(AlignItems::End),
    }
}

fn style_for_node(node: &Node, parent_kind: ParentKind) -> Style {
    let mut style = Style::default();
    if matches!(parent_kind, ParentKind::Root) {
        style.position = Position::Absolute;
    }

    match node {
        Node::Rect(node) => {
            style.size = fixed_size(node.width, node.height);
        }
        Node::Text(node) => {
            let (width, height) = text_dimensions(node);
            style.size = fixed_size(width, height);
        }
        Node::Image(node) => {
            style.size = fixed_size(node.width, node.height);
        }
        Node::Math(node) => {
            style.size = fixed_size(node.width.unwrap_or(0.0), node.height.unwrap_or(0.0));
        }
        Node::FunctionGraph(node) => {
            style.size = fixed_size(node.width, node.height);
        }
        Node::ParametricGraph(node) => {
            style.size = fixed_size(node.width, node.height);
        }
        Node::Center(node) => {
            style.display = Display::Flex;
            style.justify_content = Some(JustifyContent::Center);
            style.align_items = Some(AlignItems::Center);
            style.size = optional_size(node.width, node.height, true);
        }
        Node::Align(node) => {
            let padding = node.padding.unwrap_or(0.0) as f32;
            style.display = Display::Flex;
            style.justify_content = justify_for_anchor(node.position);
            style.align_items = align_for_anchor(node.position);
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
    parent_kind: ParentKind,
    nodes: &indexmap::IndexMap<String, Node>,
    tree: &mut TaffyTree<()>,
    built: &mut HashMap<String, NodeId>,
) -> Result<NodeId, String> {
    if let Some(node_id) = built.get(id) {
        return Ok(*node_id);
    }
    let node = nodes
        .get(id)
        .ok_or_else(|| format!("missing node {id} during layout"))?;
    let child_ids = node.children().to_vec();
    let mut child_nodes = Vec::with_capacity(child_ids.len());
    for child_id in &child_ids {
        child_nodes.push(build_tree(
            child_id,
            ParentKind::Layout,
            nodes,
            tree,
            built,
        )?);
    }

    let style = style_for_node(node, parent_kind);
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
    positions: &mut HashMap<String, (f64, f64)>,
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
    positions.insert(id.to_string(), pos);

    for child_id in node.children() {
        collect_positions(child_id, pos, nodes, tree, built, positions)?;
    }
    Ok(())
}

pub fn resolve_layout(
    nodes: &indexmap::IndexMap<String, Node>,
    frame_w: f64,
    frame_h: f64,
) -> HashMap<String, (f64, f64)> {
    let mut positions = HashMap::new();
    let root_ids = roots(nodes);
    let mut tree: TaffyTree<()> = TaffyTree::new();
    let mut built = HashMap::new();

    let mut root_children = Vec::with_capacity(root_ids.len());
    for root_id in &root_ids {
        match build_tree(root_id, ParentKind::Root, nodes, &mut tree, &mut built) {
            Ok(node_id) => root_children.push(node_id),
            Err(_) => return positions,
        }
    }

    let root = match tree.new_with_children(
        Style {
            size: fixed_size(frame_w, frame_h),
            ..Default::default()
        },
        &root_children,
    ) {
        Ok(root) => root,
        Err(_) => return positions,
    };

    if tree.compute_layout(root, Size::MAX_CONTENT).is_err() {
        return positions;
    }

    for root_id in &root_ids {
        if collect_positions(root_id, (0.0, 0.0), nodes, &tree, &built, &mut positions).is_err()
        {
            return HashMap::new();
        }
    }

    positions
}
