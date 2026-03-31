struct Globals {
    canvas_size: vec2<f32>,
    _pad: vec2<f32>,
};

@group(0) @binding(0)
var<uniform> globals: Globals;

struct VertIn {
    @location(0) position: vec2<f32>,
    @location(1) color: vec4<f32>,
};

struct VertOut {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@vertex
fn vs_main(in: VertIn) -> VertOut {
    let ndc_x =  (in.position.x / globals.canvas_size.x) * 2.0 - 1.0;
    let ndc_y = -(in.position.y / globals.canvas_size.y) * 2.0 + 1.0;

    var out: VertOut;
    out.position = vec4<f32>(ndc_x, ndc_y, 0.0, 1.0);
    out.color    = in.color;
    return out;
}

@fragment
fn fs_main(in: VertOut) -> @location(0) vec4<f32> {
    return in.color;
}
