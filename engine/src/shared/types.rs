use crate::schema::TextAlign;

pub struct ResolvedRect {
    pub width: f64,
    pub height: f64,
    pub fill: Option<String>,
    pub stroke: Option<String>,
    pub stroke_width: f64,
    pub corner_radius: f64,
}

pub struct ResolvedText {
    pub text: String,
    pub color: String,
    pub font_size: f64,
    pub line_height: f64,
    pub max_width: Option<f64>,
    pub text_align: TextAlign,
}

pub enum ResolvedNodeData {
    Rect(ResolvedRect),
    Text(ResolvedText),
}

pub struct ResolvedNode {
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
    pub background: String,
    pub nodes: Vec<ResolvedNode>,
}
