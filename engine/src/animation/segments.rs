use crate::color;
use crate::schema::{Easing, TimelineEvent};

use super::easing::ease;

#[derive(Clone)]
struct NumSeg {
    start: f64,
    end: f64,
    to: f64,
    easing: Easing,
}

#[derive(Clone)]
struct ColorSeg {
    start: f64,
    end: f64,
    to: String,
    easing: Easing,
}

#[derive(Clone, Default)]
pub(super) struct NumTrack {
    segs: Vec<NumSeg>,
}

impl NumTrack {
    pub(super) fn compile(events: &[TimelineEvent], prop: &str) -> Option<Self> {
        let segs = events
            .iter()
            .filter_map(|event| {
                event.get_num(prop).map(|value| NumSeg {
                    start: event.at,
                    end: event.at + event.dur.unwrap_or(0.0),
                    to: value,
                    easing: event.ease.unwrap_or(Easing::EaseOut),
                })
            })
            .collect::<Vec<_>>();

        if segs.is_empty() {
            None
        } else {
            Some(Self { segs })
        }
    }

    pub(super) fn resolve(&self, base: f64, t: f64) -> f64 {
        let mut value = base;
        for seg in &self.segs {
            if t < seg.start {
                return value;
            }
            if t >= seg.end || seg.start == seg.end {
                value = seg.to;
                continue;
            }

            let raw = ((t - seg.start) / (seg.end - seg.start)).min(1.0);
            return value + (seg.to - value) * ease(raw, seg.easing);
        }
        value
    }
}

#[derive(Clone, Default)]
pub(super) struct ColorTrack {
    segs: Vec<ColorSeg>,
}

impl ColorTrack {
    pub(super) fn compile(events: &[TimelineEvent], prop: &str) -> Option<Self> {
        let segs = events
            .iter()
            .filter_map(|event| {
                event.get_color(prop).map(|value| ColorSeg {
                    start: event.at,
                    end: event.at + event.dur.unwrap_or(0.0),
                    to: value.to_string(),
                    easing: event.ease.unwrap_or(Easing::EaseOut),
                })
            })
            .collect::<Vec<_>>();

        if segs.is_empty() {
            None
        } else {
            Some(Self { segs })
        }
    }

    pub(super) fn resolve(&self, base: Option<&str>, t: f64) -> Option<String> {
        let mut value = base.map(str::to_string);
        for seg in &self.segs {
            if t < seg.start {
                return value;
            }
            if t >= seg.end || seg.start == seg.end {
                value = Some(seg.to.clone());
                continue;
            }

            let from = value.as_deref().unwrap_or(&seg.to);
            let raw = ((t - seg.start) / (seg.end - seg.start)).min(1.0);
            return Some(color::lerp_oklch(from, &seg.to, ease(raw, seg.easing)));
        }
        value
    }
}

#[cfg(test)]
mod tests {
    use super::NumTrack;
    use crate::schema::{EventTarget, TimelineEvent};

    #[test]
    fn num_track_should_resolve_against_the_runtime_base_value() {
        let track = NumTrack::compile(
            &[TimelineEvent {
                target: EventTarget::Single("node".to_string()),
                at: 1.0,
                dur: Some(1.0),
                ease: None,
                action: None,
                opacity: Some(10.0),
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
            "opacity",
        )
        .expect("track should compile");

        assert_eq!(track.resolve(2.0, 0.5), 2.0);
        assert!(track.resolve(2.0, 1.5) > 2.0);
        assert_eq!(track.resolve(2.0, 3.0), 10.0);
    }
}
