use std::cell::RefCell;
use std::collections::HashMap;

use skia_safe::{Font, FontMgr, FontStyle, Paint, Typeface};

use crate::schema::TextNode;
use crate::shared::consts::{DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT_MULT};
use crate::shared::types::ResolvedText;

const TEXT_WIDTH_FACTOR: f64 = 0.6;

#[derive(Clone)]
pub struct MeasuredLine {
    pub left: f32,
    pub width: f32,
}

#[derive(Clone)]
pub struct MeasuredText {
    pub width: f64,
    pub height: f64,
    pub baseline_offset: f32,
    pub lines: Vec<MeasuredLine>,
}

#[derive(Clone, Hash, Eq, PartialEq)]
struct TextMeasureKey {
    font_family: Option<String>,
    font_size_bits: u64,
    line_height_bits: u64,
    max_width_bits: Option<u64>,
    text: String,
}

pub trait TextMeasurer {
    fn default_typeface(&self) -> Option<&Typeface>;
    fn measure_resolved_text(&self, text: &ResolvedText) -> MeasuredText;
    fn measure_text_node(&self, node: &TextNode) -> MeasuredText;
}

pub struct SkiaTextMeasurer {
    cache: RefCell<HashMap<TextMeasureKey, MeasuredText>>,
    default_typeface: Option<Typeface>,
}

thread_local! {
    static FONT_MGR: RefCell<FontMgr> = RefCell::new(FontMgr::new());
}

pub fn load_default_font() -> Option<Typeface> {
    FONT_MGR.with(|mgr| {
        let mgr = mgr.borrow();
        for family in ["Arial", "Helvetica", "DejaVu Sans"] {
            if let Some(typeface) = mgr.match_family_style(family, FontStyle::normal()) {
                return Some(typeface);
            }
        }
        eprintln!("warning: no system font found, text will not render");
        None
    })
}

impl SkiaTextMeasurer {
    pub fn new() -> Self {
        Self {
            cache: RefCell::new(HashMap::new()),
            default_typeface: load_default_font(),
        }
    }

    fn measure_cached(
        &self,
        text: &str,
        font_family: Option<&str>,
        font_size: f64,
        line_height: f64,
        max_width: Option<f64>,
    ) -> MeasuredText {
        let key = TextMeasureKey {
            font_family: font_family.map(str::to_string),
            font_size_bits: font_size.to_bits(),
            line_height_bits: line_height.to_bits(),
            max_width_bits: max_width.map(f64::to_bits),
            text: text.to_string(),
        };

        if let Some(measured) = self.cache.borrow().get(&key) {
            return measured.clone();
        }

        let measured = measure_text(
            text,
            font_family,
            font_size,
            line_height,
            max_width,
            self.default_typeface.as_ref(),
        );
        self.cache.borrow_mut().insert(key, measured.clone());
        measured
    }
}

impl TextMeasurer for SkiaTextMeasurer {
    fn default_typeface(&self) -> Option<&Typeface> {
        self.default_typeface.as_ref()
    }

    fn measure_resolved_text(&self, text: &ResolvedText) -> MeasuredText {
        self.measure_cached(
            &text.text,
            text.font_family.as_deref(),
            text.font_size,
            text.line_height,
            text.max_width,
        )
    }

    fn measure_text_node(&self, node: &TextNode) -> MeasuredText {
        let font_size = node.size.unwrap_or(DEFAULT_FONT_SIZE);
        let line_height = node
            .line_height
            .unwrap_or(font_size * DEFAULT_LINE_HEIGHT_MULT);
        self.measure_cached(
            &node.text,
            node.font_family.as_deref(),
            font_size,
            line_height,
            node.max_width,
        )
    }
}

pub fn resolve_typeface(
    font_family: Option<&str>,
    default_typeface: Option<&Typeface>,
) -> Option<Typeface> {
    let custom = font_family.and_then(|family| {
        FONT_MGR.with(|mgr| mgr.borrow().match_family_style(family, FontStyle::normal()))
    });
    custom.or_else(|| default_typeface.cloned())
}

fn measure_text(
    text: &str,
    font_family: Option<&str>,
    font_size: f64,
    line_height: f64,
    max_width: Option<f64>,
    default_typeface: Option<&Typeface>,
) -> MeasuredText {
    let lines: Vec<&str> = text.split('\n').collect();
    let line_count = lines.len().max(1) as f64;

    let Some(typeface) = resolve_typeface(font_family, default_typeface) else {
        return fallback_measurement(text, font_size, line_height, max_width, line_count);
    };

    let font = Font::from_typeface(typeface, font_size as f32);
    let paint = Paint::default();
    let mut measured_lines = Vec::with_capacity(lines.len());
    let mut content_width = 0.0_f32;
    let mut top = f32::INFINITY;
    let mut bottom = f32::NEG_INFINITY;
    let mut has_ink = false;

    for (index, line) in lines.iter().enumerate() {
        let (_, bounds) = font.measure_str(line, Some(&paint));
        let line_width = bounds.width().max(0.0);
        let baseline = index as f32 * line_height as f32;

        measured_lines.push(MeasuredLine {
            left: bounds.left,
            width: line_width,
        });
        content_width = content_width.max(line_width);

        if line_width > 0.0 || bounds.height() > 0.0 {
            top = top.min(baseline + bounds.top);
            bottom = bottom.max(baseline + bounds.bottom);
            has_ink = true;
        }
    }

    let width = max_width.unwrap_or(content_width as f64);
    let height = if has_ink {
        (bottom - top).max(0.0) as f64
    } else {
        line_count * line_height
    };
    let baseline_offset = if has_ink { -top } else { font_size as f32 };

    MeasuredText {
        width,
        height,
        baseline_offset,
        lines: measured_lines,
    }
}

fn fallback_measurement(
    text: &str,
    font_size: f64,
    line_height: f64,
    max_width: Option<f64>,
    line_count: f64,
) -> MeasuredText {
    let lines: Vec<&str> = text.split('\n').collect();
    let estimated_width = lines
        .iter()
        .map(|line| line.chars().count() as f64 * font_size * TEXT_WIDTH_FACTOR)
        .fold(0.0, f64::max);

    MeasuredText {
        width: max_width.unwrap_or(estimated_width),
        height: line_count * line_height,
        baseline_offset: font_size as f32,
        lines: lines
            .iter()
            .map(|line| MeasuredLine {
                left: 0.0,
                width: line.chars().count() as f32 * font_size as f32 * TEXT_WIDTH_FACTOR as f32,
            })
            .collect(),
    }
}
