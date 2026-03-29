#![allow(dead_code)]

use indexmap::IndexMap;
use serde::Deserialize;

#[derive(Debug, Clone, Copy, Deserialize)]
pub enum Anchor {
    #[serde(rename = "top-left")]
    TopLeft,
    #[serde(rename = "top-center")]
    TopCenter,
    #[serde(rename = "top-right")]
    TopRight,
    #[serde(rename = "center-left")]
    CenterLeft,
    #[serde(rename = "center")]
    Center,
    #[serde(rename = "center-right")]
    CenterRight,
    #[serde(rename = "bottom-left")]
    BottomLeft,
    #[serde(rename = "bottom-center")]
    BottomCenter,
    #[serde(rename = "bottom-right")]
    BottomRight,
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub enum Easing {
    #[serde(rename = "linear")]
    Linear,
    #[serde(rename = "ease-in")]
    EaseIn,
    #[serde(rename = "ease-out")]
    EaseOut,
    #[serde(rename = "ease-in-out")]
    EaseInOut,
    #[serde(rename = "ease-in-expo")]
    EaseInExpo,
    #[serde(rename = "ease-out-expo")]
    EaseOutExpo,
    #[serde(rename = "ease-in-back")]
    EaseInBack,
    #[serde(rename = "ease-out-back")]
    EaseOutBack,
    #[serde(rename = "spring")]
    Spring,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StackAlign {
    Start,
    Center,
    End,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StackDirection {
    Horizontal,
    Vertical,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TextAlign {
    Left,
    Center,
    Right,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum FontWeight {
    Numeric(f64),
    Named(String),
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum EventTarget {
    Single(String),
    Multiple(Vec<String>),
}

impl EventTarget {
    pub fn contains(&self, id: &str) -> bool {
        match self {
            Self::Single(s) => s == id,
            Self::Multiple(v) => v.iter().any(|s| s == id),
        }
    }
}

// ---------------------------------------------------------------------------
// Top-level
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoDescription {
    pub fps: f64,
    pub width: u32,
    pub height: u32,
    #[serde(default)]
    pub background: Option<String>,
    pub scenes: Vec<SceneEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneEntry {
    pub id: String,
    #[serde(default)]
    pub background: Option<String>,
    pub duration: u32,
    pub start_frame: u32,
    pub nodes: IndexMap<String, Node>,
    #[serde(default)]
    pub timeline: Vec<TimelineEvent>,
}

// ---------------------------------------------------------------------------
// Shared node layout/transform fields
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeBase {
    pub opacity: Option<f64>,
    pub rotate: Option<f64>,
    pub scale: Option<f64>,
    pub scale_x: Option<f64>,
    pub scale_y: Option<f64>,
    pub skew_x: Option<f64>,
    pub skew_y: Option<f64>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub z_index: Option<i32>,
}

// ---------------------------------------------------------------------------
// Node variants — tagged union on "type"
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type")]
pub enum Node {
    #[serde(rename = "align")]
    Align(AlignNode),
    #[serde(rename = "center")]
    Center(CenterNode),
    #[serde(rename = "rect")]
    Rect(RectNode),
    #[serde(rename = "stack")]
    Stack(StackNode),
    #[serde(rename = "text")]
    Text(TextNode),
    #[serde(rename = "image")]
    Image(ImageNode),
    #[serde(rename = "math")]
    Math(MathNode),
    #[serde(rename = "functionGraph")]
    FunctionGraph(FunctionGraphNode),
    #[serde(rename = "parametricGraph")]
    ParametricGraph(ParametricGraphNode),
}

impl Node {
    pub fn base(&self) -> &NodeBase {
        match self {
            Self::Align(n) => &n.base,
            Self::Center(n) => &n.base,
            Self::Rect(n) => &n.base,
            Self::Stack(n) => &n.base,
            Self::Text(n) => &n.base,
            Self::Image(n) => &n.base,
            Self::Math(n) => &n.base,
            Self::FunctionGraph(n) => &n.base,
            Self::ParametricGraph(n) => &n.base,
        }
    }

    pub fn children(&self) -> &[String] {
        match self {
            Self::Align(n) => &n.children,
            Self::Center(n) => &n.children,
            Self::Stack(n) => &n.children,
            _ => &[],
        }
    }

    pub fn is_layout(&self) -> bool {
        matches!(self, Self::Align(_) | Self::Center(_) | Self::Stack(_))
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CenterNode {
    #[serde(flatten)]
    pub base: NodeBase,
    pub children: Vec<String>,
    pub width: Option<f64>,
    pub height: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlignNode {
    #[serde(flatten)]
    pub base: NodeBase,
    pub children: Vec<String>,
    pub position: Anchor,
    pub padding: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StackNode {
    #[serde(flatten)]
    pub base: NodeBase,
    pub children: Vec<String>,
    pub direction: StackDirection,
    pub gap: Option<f64>,
    pub align: Option<StackAlign>,
    pub width: Option<f64>,
    pub height: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RectNode {
    #[serde(flatten)]
    pub base: NodeBase,
    pub width: f64,
    pub height: f64,
    pub fill: Option<String>,
    pub stroke: Option<String>,
    pub stroke_width: Option<f64>,
    pub corner_radius: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextNode {
    #[serde(flatten)]
    pub base: NodeBase,
    pub text: String,
    pub color: Option<String>,
    pub font_family: Option<String>,
    pub font_weight: Option<FontWeight>,
    pub line_height: Option<f64>,
    pub max_width: Option<f64>,
    pub size: Option<f64>,
    pub text_align: Option<TextAlign>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageNode {
    #[serde(flatten)]
    pub base: NodeBase,
    pub width: f64,
    pub height: f64,
    pub src: String,
    pub fit: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MathNode {
    #[serde(flatten)]
    pub base: NodeBase,
    pub latex: String,
    pub font_size: f64,
    pub color: Option<String>,
    pub width: Option<f64>,
    pub height: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionGraphNode {
    #[serde(flatten)]
    pub base: NodeBase,
    pub width: f64,
    pub height: f64,
    #[serde(rename = "fn")]
    pub function: String,
    pub x_range: Vec<f64>,
    pub y_range: Vec<f64>,
    pub color: Option<String>,
    pub draw_progress: Option<f64>,
    pub show_axes: Option<bool>,
    pub show_grid: Option<bool>,
    pub stroke_width: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParametricGraphNode {
    #[serde(flatten)]
    pub base: NodeBase,
    pub width: f64,
    pub height: f64,
    pub fn_x: String,
    pub fn_y: String,
    pub t_range: Vec<f64>,
    pub color: Option<String>,
    pub draw_progress: Option<f64>,
    pub samples: Option<u32>,
    pub stroke_width: Option<f64>,
}

// ---------------------------------------------------------------------------
// Timeline events
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEvent {
    pub target: EventTarget,
    pub at: f64,
    pub dur: Option<f64>,
    pub ease: Option<Easing>,
    pub action: Option<String>,
    // Numeric animatable properties
    pub opacity: Option<f64>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub dx: Option<f64>,
    pub dy: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub rotate: Option<f64>,
    pub scale: Option<f64>,
    pub scale_x: Option<f64>,
    pub scale_y: Option<f64>,
    pub skew_x: Option<f64>,
    pub skew_y: Option<f64>,
    pub corner_radius: Option<f64>,
    pub stroke_width: Option<f64>,
    pub size: Option<f64>,
    pub draw_progress: Option<f64>,
    // Color animatable properties
    pub fill: Option<String>,
    pub stroke: Option<String>,
    pub color: Option<String>,
}

impl TimelineEvent {
    pub fn get_num(&self, prop: &str) -> Option<f64> {
        match prop {
            "opacity" => self.opacity,
            "x" => self.x,
            "y" => self.y,
            "dx" => self.dx,
            "dy" => self.dy,
            "width" => self.width,
            "height" => self.height,
            "rotate" => self.rotate,
            "scale" => self.scale,
            "scaleX" => self.scale_x,
            "scaleY" => self.scale_y,
            "skewX" => self.skew_x,
            "skewY" => self.skew_y,
            "cornerRadius" => self.corner_radius,
            "strokeWidth" => self.stroke_width,
            "size" => self.size,
            "drawProgress" => self.draw_progress,
            _ => None,
        }
    }

    pub fn get_color(&self, prop: &str) -> Option<&str> {
        match prop {
            "fill" => self.fill.as_deref(),
            "stroke" => self.stroke.as_deref(),
            "color" => self.color.as_deref(),
            _ => None,
        }
    }
}
