// Instanced textured-quad renderer for glyph atlas text.
//
// Each glyph is drawn as a unit quad scaled to the glyph's pixel dimensions.
// The vertex shader applies a 2-D affine transform (from the parent text node)
// then converts to NDC.  The fragment shader samples the glyph atlas and
// multiplies by the text colour + opacity.

struct Globals {
    canvas_size: vec2<f32>,
    _pad: vec2<f32>,
};

@group(0) @binding(0)
var<uniform> globals: Globals;

@group(1) @binding(0)
var atlas_texture: texture_2d<f32>;
@group(1) @binding(1)
var atlas_sampler: sampler;

// ── Vertex input ─────────────────────────────────────────────────────────────

struct VertIn {
    @location(0) quad_pos: vec2<f32>,      // unit quad [-0.5, 0.5]

    // Per-instance
    @location(1) mat_col0: vec2<f32>,      // 2×2 affine col 0
    @location(2) mat_col1: vec2<f32>,      // 2×2 affine col 1
    @location(3) translation: vec2<f32>,   // world-space position (pixels)
    @location(4) glyph_size: vec2<f32>,    // glyph pixel dimensions
    @location(5) uv_origin: vec2<f32>,     // atlas UV top-left
    @location(6) uv_extent: vec2<f32>,     // atlas UV width/height
    @location(7) color: vec4<f32>,         // premultiplied text colour with opacity
};

// ── Vertex output ─────────────────────────────────────────────────────────────

struct VertOut {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) color: vec4<f32>,
};

// ── Vertex shader ─────────────────────────────────────────────────────────────

@vertex
fn vs_main(in: VertIn) -> VertOut {
    // Expand unit quad to glyph pixel dimensions, centred on origin.
    let local = in.quad_pos * in.glyph_size;

    // Apply affine transform.
    let world_x = in.mat_col0.x * local.x + in.mat_col1.x * local.y + in.translation.x;
    let world_y = in.mat_col0.y * local.x + in.mat_col1.y * local.y + in.translation.y;

    // NDC (top-left origin, y-down → clip y-up).
    let ndc_x =  (world_x / globals.canvas_size.x) * 2.0 - 1.0;
    let ndc_y = -(world_y / globals.canvas_size.y) * 2.0 + 1.0;

    // UV: map quad_pos from [-0.5, 0.5] → [0, 1] then scale to atlas region.
    let uv_local = in.quad_pos + vec2<f32>(0.5, 0.5);
    let uv = in.uv_origin + uv_local * in.uv_extent;

    var out: VertOut;
    out.position = vec4<f32>(ndc_x, ndc_y, 0.0, 1.0);
    out.uv       = uv;
    out.color    = in.color;
    return out;
}

// ── Fragment shader ───────────────────────────────────────────────────────────

@fragment
fn fs_main(in: VertOut) -> @location(0) vec4<f32> {
    let atlas_sample = textureSample(atlas_texture, atlas_sampler, in.uv);
    // The atlas stores alpha-only glyphs in the R channel.
    let glyph_alpha = atlas_sample.r;
    return in.color * glyph_alpha;
}
