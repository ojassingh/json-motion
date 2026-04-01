use crate::schema::{IconLineCap, IconLineJoin, IconPrimitive, LineCap, TextAlign};

pub struct ResolvedCircle {
    pub radius: f64,
    pub fill: Option<(u8, u8, u8)>,
    pub stroke: Option<(u8, u8, u8)>,
    pub stroke_width: f64,
    pub draw_progress: f64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ResolvedNodeBatchKind {
    Dynamic,
    Static,
}

pub struct ResolvedRect {
    pub width: f64,
    pub height: f64,
    pub fill: Option<(u8, u8, u8)>,
    pub stroke: Option<(u8, u8, u8)>,
    pub stroke_width: f64,
    pub corner_radius: f64,
}

pub struct ResolvedText {
    pub text: String,
    pub color: (u8, u8, u8),
    pub font_family: Option<String>,
    pub font_size: f64,
    pub line_height: f64,
    pub max_width: Option<f64>,
    pub text_align: TextAlign,
}

pub struct ResolvedArrow {
    pub width: f64,
    pub height: f64,
    pub start: (f64, f64),
    pub end: (f64, f64),
    pub stroke: (u8, u8, u8),
    pub stroke_width: f64,
    pub head_size: f64,
}

pub struct ResolvedLine {
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    pub stroke: (u8, u8, u8),
    pub stroke_width: f64,
    pub cap: LineCap,
    pub draw_progress: f64,
}

pub struct ResolvedIcon {
    pub width: f64,
    pub height: f64,
    pub viewport_width: f64,
    pub viewport_height: f64,
    pub stroke: (u8, u8, u8),
    pub fill: Option<(u8, u8, u8)>,
    pub stroke_width: f64,
    pub absolute_stroke_width: bool,
    pub line_cap: IconLineCap,
    pub line_join: IconLineJoin,
    pub elements: Vec<IconPrimitive>,
}

pub enum ResolvedNodeData {
    Arrow(ResolvedArrow),
    Circle(ResolvedCircle),
    Icon(ResolvedIcon),
    Line(ResolvedLine),
    Rect(ResolvedRect),
    Text(ResolvedText),
}

pub struct ResolvedNode {
    pub batch_kind: ResolvedNodeBatchKind,
    pub data: ResolvedNodeData,
    pub x: f64,
    pub y: f64,
    pub opacity: f64,
    pub rotation: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub skew_x: f64,
    pub skew_y: f64,
    pub z_index: i32,
    pub source_index: usize,
}

pub struct ResolvedFrame {
    pub background: (u8, u8, u8),
    pub nodes: Vec<ResolvedNode>,
    pub scene_cache_key: u64,
}
