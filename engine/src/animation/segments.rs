use crate::color;
use crate::schema::{Easing, TimelineEvent};

use super::easing::ease;

struct NumSeg {
    start: f64,
    end: f64,
    from: f64,
    to: f64,
    easing: Easing,
}

struct ColorSeg {
    start: f64,
    end: f64,
    from: String,
    to: String,
    easing: Easing,
}

fn build_num_segs(events: &[TimelineEvent], prop: &str, base: f64) -> Vec<NumSeg> {
    let mut segs = Vec::new();
    let mut last = base;
    for ev in events {
        if let Some(val) = ev.get_num(prop) {
            let dur = ev.dur.unwrap_or(0.0);
            segs.push(NumSeg {
                start: ev.at,
                end: ev.at + dur,
                from: last,
                to: val,
                easing: ev.ease.unwrap_or(Easing::EaseOut),
            });
            last = val;
        }
    }
    segs
}

fn build_color_segs(
    events: &[TimelineEvent],
    prop: &str,
    base: Option<&str>,
) -> Vec<ColorSeg> {
    let mut segs = Vec::new();
    let mut last: Option<String> = base.map(String::from);
    for ev in events {
        if let Some(val) = ev.get_color(prop) {
            match &last {
                Some(prev) => {
                    let dur = ev.dur.unwrap_or(0.0);
                    segs.push(ColorSeg {
                        start: ev.at,
                        end: ev.at + dur,
                        from: prev.clone(),
                        to: val.to_string(),
                        easing: ev.ease.unwrap_or(Easing::EaseOut),
                    });
                    last = Some(val.to_string());
                }
                None => last = Some(val.to_string()),
            }
        }
    }
    segs
}

fn resolve_num(segs: &[NumSeg], base: f64, t: f64) -> f64 {
    let mut val = base;
    for s in segs {
        if t < s.start {
            return val;
        }
        if t >= s.end || s.start == s.end {
            val = s.to;
            continue;
        }
        let raw = ((t - s.start) / (s.end - s.start)).min(1.0);
        return s.from + (s.to - s.from) * ease(raw, s.easing);
    }
    val
}

/// Convenience wrapper: build + resolve in one call so callers never touch
/// the private `NumSeg` type.
pub(super) fn num_at(events: &[TimelineEvent], prop: &str, base: f64, t: f64) -> f64 {
    resolve_num(&build_num_segs(events, prop, base), base, t)
}

/// Convenience wrapper: build + resolve in one call so callers never touch
/// the private `ColorSeg` type.
pub(super) fn color_at(
    events: &[TimelineEvent],
    prop: &str,
    base: Option<&str>,
    t: f64,
) -> Option<String> {
    resolve_color(&build_color_segs(events, prop, base), base, t)
}

fn resolve_color(segs: &[ColorSeg], base: Option<&str>, t: f64) -> Option<String> {
    let mut val: Option<String> = base.map(String::from);
    for s in segs {
        if t < s.start {
            return val;
        }
        if t >= s.end || s.start == s.end {
            val = Some(s.to.clone());
            continue;
        }
        let raw = ((t - s.start) / (s.end - s.start)).min(1.0);
        return Some(color::lerp_oklch(&s.from, &s.to, ease(raw, s.easing)));
    }
    val
}
