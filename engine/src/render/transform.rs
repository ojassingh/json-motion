use skia_safe::{paint, Color, Matrix, Paint};

use crate::scene::types::ResolvedNode;

pub(crate) fn make_paint(alpha: u8, (r, g, b): (u8, u8, u8), style: paint::Style) -> Paint {

    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_style(style);
    paint.set_color(Color::from_argb(alpha, r, g, b));
    paint
}

pub(crate) fn apply_node_transform(
    canvas: &skia_safe::Canvas,
    node: &ResolvedNode,
    w: f32,
    h: f32,
) {
    let cx = w / 2.0;
    let cy = h / 2.0;
    canvas.translate((node.x as f32 + cx, node.y as f32 + cy));
    canvas.rotate(node.rotation as f32, None);
    canvas.scale((node.scale_x as f32, node.scale_y as f32));

    let skew_x = (node.skew_x as f32).to_radians().tan();
    let skew_y = (node.skew_y as f32).to_radians().tan();
    if skew_x != 0.0 || skew_y != 0.0 {
        let matrix = Matrix::new_all(1.0, skew_x, 0.0, skew_y, 1.0, 0.0, 0.0, 0.0, 1.0);
        canvas.concat(&matrix);
    }

    canvas.translate((-cx, -cy));
}

