use skia_safe::{paint, Canvas, Paint, Path, RRect, Rect};

use crate::render::{apply_node_transform, make_paint};
use crate::schema::{
    IconCirclePrimitive, IconLineCap, IconLineJoin, IconPrimitive, IconRectPrimitive,
};
use crate::scene::types::{ResolvedIcon, ResolvedNode};

pub(crate) fn draw_icon(canvas: &Canvas, node: &ResolvedNode, icon: &ResolvedIcon) {
    let alpha = (255.0 * node.opacity.clamp(0.0, 1.0)) as u8;
    let width = icon.width as f32;
    let height = icon.height as f32;
    let vw = icon.viewport_width.max(f64::EPSILON) as f32;
    let vh = icon.viewport_height.max(f64::EPSILON) as f32;
    let sx = width / vw;
    let sy = height / vh;

    let stroke_width = if icon.absolute_stroke_width {
        icon.stroke_width as f32 / sx.min(sy).max(f32::EPSILON)
    } else {
        icon.stroke_width as f32
    };

    let fill = icon.fill.map(|c| make_paint(alpha, c, paint::Style::Fill));
    let mut stroke = make_paint(alpha, icon.stroke, paint::Style::Stroke);
    stroke.set_stroke_width(stroke_width);
    stroke.set_stroke_cap(line_cap(icon.line_cap));
    stroke.set_stroke_join(line_join(icon.line_join));

    canvas.save();
    apply_node_transform(canvas, node, width, height);
    canvas.scale((sx, sy));
    for element in &icon.elements {
        draw_primitive(canvas, element, fill.as_ref(), &stroke);
    }
    canvas.restore();
}

fn draw_primitive(
    canvas: &Canvas,
    primitive: &IconPrimitive,
    fill: Option<&Paint>,
    stroke: &Paint,
) {
    match primitive {
        IconPrimitive::Path(p) => paint_path(canvas, &p.d, fill, Some(stroke)),
        IconPrimitive::Circle(c) => paint_circle(canvas, c, fill, stroke),
        IconPrimitive::Line(l) => {
            paint_path(
                canvas,
                &format!("M{} {} L{} {}", l.x1, l.y1, l.x2, l.y2),
                None,
                Some(stroke),
            );
        }
        IconPrimitive::Polyline(pl) => {
            if let Some(d) = points_to_svg(&pl.points, false) {
                paint_path(canvas, &d, None, Some(stroke));
            }
        }
        IconPrimitive::Polygon(pg) => {
            if let Some(d) = points_to_svg(&pg.points, true) {
                paint_path(canvas, &d, fill, Some(stroke));
            }
        }
        IconPrimitive::Rect(r) => paint_rect(canvas, r, fill, stroke),
    }
}

fn paint_path(canvas: &Canvas, d: &str, fill: Option<&Paint>, stroke: Option<&Paint>) {
    let Some(path) = Path::from_svg(d) else {
        return;
    };
    if let Some(f) = fill {
        canvas.draw_path(&path, f);
    }
    if let Some(s) = stroke {
        canvas.draw_path(&path, s);
    }
}

fn paint_circle(canvas: &Canvas, c: &IconCirclePrimitive, fill: Option<&Paint>, stroke: &Paint) {
    let center = (c.cx as f32, c.cy as f32);
    let r = c.r as f32;
    if let Some(f) = fill {
        canvas.draw_circle(center, r, f);
    }
    canvas.draw_circle(center, r, stroke);
}

fn paint_rect(canvas: &Canvas, rect: &IconRectPrimitive, fill: Option<&Paint>, stroke: &Paint) {
    let x = rect.x.unwrap_or(0.0) as f32;
    let y = rect.y.unwrap_or(0.0) as f32;
    let w = rect.width as f32;
    let h = rect.height as f32;
    let rx = rect.rx.unwrap_or(0.0) as f32;
    let ry = rect.ry.unwrap_or(rect.rx.unwrap_or(0.0)) as f32;
    let shape = Rect::from_xywh(x, y, w, h);

    if rx > 0.0 || ry > 0.0 {
        let rounded = RRect::new_rect_xy(shape, rx, ry);
        if let Some(f) = fill {
            canvas.draw_rrect(rounded, f);
        }
        canvas.draw_rrect(rounded, stroke);
    } else {
        if let Some(f) = fill {
            canvas.draw_rect(shape, f);
        }
        canvas.draw_rect(shape, stroke);
    }
}

fn points_to_svg(points: &[(f64, f64)], close: bool) -> Option<String> {
    let (fx, fy) = *points.first()?;
    let mut d = format!("M{fx} {fy}");
    for (x, y) in points.iter().skip(1) {
        d.push_str(&format!(" L{x} {y}"));
    }
    if close {
        d.push('Z');
    }
    Some(d)
}

fn line_cap(cap: IconLineCap) -> paint::Cap {
    match cap {
        IconLineCap::Butt => paint::Cap::Butt,
        IconLineCap::Round => paint::Cap::Round,
        IconLineCap::Square => paint::Cap::Square,
    }
}

fn line_join(join: IconLineJoin) -> paint::Join {
    match join {
        IconLineJoin::Bevel => paint::Join::Bevel,
        IconLineJoin::Miter => paint::Join::Miter,
        IconLineJoin::Round => paint::Join::Round,
    }
}
