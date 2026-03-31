// Instanced rounded-rect renderer.
//
// Each rect is drawn as a unit quad in [-0.5, 0.5] x [-0.5, 0.5].  The
// vertex shader expands the quad using the per-instance half-size and
// applies the full 2-D affine transform (rotation + scale + skew) before
// converting to NDC.  The fragment shader computes a signed-distance field
// for a rounded rectangle and composites fill and stroke using
// premultiplied-alpha Porter-Duff.

struct Globals {
    canvas_size: vec2<f32>,
    _pad: vec2<f32>,
};

@group(0) @binding(0)
var<uniform> globals: Globals;

// ── Vertex input ─────────────────────────────────────────────────────────────

struct VertIn {
    // slot 0 — vertex buffer (unit quad)
    @location(0) quad_pos: vec2<f32>,

    // slot 1 — instance buffer
    // 2×2 transform matrix stored as two column vectors.
    // mat = [ [mat_col0.x  mat_col1.x]
    //         [mat_col0.y  mat_col1.y] ]
    @location(1) mat_col0: vec2<f32>,
    @location(2) mat_col1: vec2<f32>,
    // World-space centre of the rect (pixels, top-left origin, y-down).
    @location(3) translation: vec2<f32>,
    // Half-dimensions of the rect in pixels.
    @location(4) half_size: vec2<f32>,
    @location(5) corner_radius: f32,
    @location(6) opacity: f32,
    @location(7) stroke_width: f32,
    @location(8) has_fill: f32,      // 1.0 = yes
    @location(9) has_stroke: f32,    // 1.0 = yes
    @location(10) _pad: f32,
    @location(11) fill_color: vec4<f32>,
    @location(12) stroke_color: vec4<f32>,
};

// ── Vertex output / fragment input ───────────────────────────────────────────

struct VertOut {
    @builtin(position) position: vec4<f32>,
    // Position relative to the rect centre in pixels (for SDF).
    @location(0) local_pos: vec2<f32>,
    @location(1) half_size: vec2<f32>,
    // Packed: x=corner_radius  y=opacity  z=stroke_width  w=has_fill
    @location(2) params: vec4<f32>,
    @location(3) has_stroke: f32,
    @location(4) fill_color: vec4<f32>,
    @location(5) stroke_color: vec4<f32>,
};

// ── Vertex shader ─────────────────────────────────────────────────────────────

@vertex
fn vs_main(in: VertIn) -> VertOut {
    // Expand the unit quad to pixel-space coords relative to the rect centre.
    // quad_pos ∈ [-0.5, 0.5]  →  local ∈ [-half_size, +half_size]
    let local = in.quad_pos * in.half_size * 2.0;

    // Apply the 2-D affine transform.
    // world = mat * local + translation
    let world_x = in.mat_col0.x * local.x + in.mat_col1.x * local.y + in.translation.x;
    let world_y = in.mat_col0.y * local.x + in.mat_col1.y * local.y + in.translation.y;

    // Convert pixel coords to NDC (top-left origin, y-down → NDC y-up).
    let ndc_x =  (world_x / globals.canvas_size.x) * 2.0 - 1.0;
    let ndc_y = -(world_y / globals.canvas_size.y) * 2.0 + 1.0;

    var out: VertOut;
    out.position    = vec4<f32>(ndc_x, ndc_y, 0.0, 1.0);
    out.local_pos   = local;
    out.half_size   = in.half_size;
    out.params      = vec4<f32>(in.corner_radius, in.opacity, in.stroke_width, in.has_fill);
    out.has_stroke  = in.has_stroke;
    out.fill_color  = in.fill_color;
    out.stroke_color = in.stroke_color;
    return out;
}

// ── SDF helpers ──────────────────────────────────────────────────────────────

// Signed distance to a rounded box centred at origin.
//   p  – query point
//   b  – half-extents
//   r  – corner radius
fn sdf_rounded_box(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
    let q = abs(p) - b + vec2<f32>(r, r);
    return length(max(q, vec2<f32>(0.0, 0.0))) + min(max(q.x, q.y), 0.0) - r;
}

// ── Fragment shader ───────────────────────────────────────────────────────────

@fragment
fn fs_main(in: VertOut) -> @location(0) vec4<f32> {
    let corner_radius = in.params.x;
    let opacity       = in.params.y;
    let stroke_width  = in.params.z;
    let has_fill      = in.params.w;
    let has_stroke    = in.has_stroke;

    let d  = sdf_rounded_box(in.local_pos, in.half_size, corner_radius);
    let aa = fwidth(d);

    // Accumulate premultiplied-alpha colour (Porter-Duff "over" compositing).
    var out_premul = vec4<f32>(0.0, 0.0, 0.0, 0.0);

    // Fill — covers the inside of the shape.
    if has_fill > 0.5 {
        let fill_a = (1.0 - smoothstep(-aa, aa, d)) * opacity;
        let fc = in.fill_color;
        out_premul = vec4<f32>(fc.rgb * (fc.a * fill_a), fc.a * fill_a);
    }

    // Stroke — centred on the SDF zero-crossing.
    if has_stroke > 0.5 && stroke_width > 0.0 {
        let sd       = abs(d) - stroke_width * 0.5;
        let stroke_a = (1.0 - smoothstep(-aa, aa, sd)) * opacity;
        let sc       = in.stroke_color;
        let src      = vec4<f32>(sc.rgb * (sc.a * stroke_a), sc.a * stroke_a);
        // stroke over fill
        out_premul = src + out_premul * (1.0 - src.a);
    }

    return out_premul;
}
