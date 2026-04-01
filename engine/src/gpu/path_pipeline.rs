use crate::schema::{IconLineCap, IconLineJoin, IconPrimitive};
use crate::scene::types::{ResolvedIcon, ResolvedNode};
use bytemuck::{Pod, Zeroable};
use lyon::extra::parser::ParserOptions;
use lyon::tessellation::{
    BuffersBuilder, FillOptions, FillTessellator, FillVertexConstructor, StrokeOptions,
    StrokeTessellator, StrokeVertexConstructor, VertexBuffers,
};

#[repr(C)]
#[derive(Copy, Clone, Pod, Zeroable)]
pub struct PathVertex {
    pub position: [f32; 2],
    pub color: [f32; 4],
}

pub struct StrokeStyle {
    pub color: [f32; 4],
    pub join: lyon::tessellation::LineJoin,
    pub line_cap: lyon::tessellation::LineCap,
    pub width: f32,
}

struct VertexCtor {
    color: [f32; 4],
    offset: [f32; 2],
}

impl FillVertexConstructor<PathVertex> for VertexCtor {
    fn new_vertex(&mut self, vertex: lyon::tessellation::FillVertex) -> PathVertex {
        let p = vertex.position();
        PathVertex {
            position: [p.x + self.offset[0], p.y + self.offset[1]],
            color: self.color,
        }
    }
}

impl StrokeVertexConstructor<PathVertex> for VertexCtor {
    fn new_vertex(&mut self, vertex: lyon::tessellation::StrokeVertex) -> PathVertex {
        let p = vertex.position();
        PathVertex {
            position: [p.x + self.offset[0], p.y + self.offset[1]],
            color: self.color,
        }
    }
}

pub struct PathPipeline {
    pub pipeline: wgpu::RenderPipeline,
}

impl PathPipeline {
    pub fn new(
        device: &wgpu::Device,
        framebuffer_format: wgpu::TextureFormat,
        sample_count: u32,
        globals_layout: &Option<&wgpu::BindGroupLayout>,
    ) -> Self {
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("path_shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("shaders/path.wgsl").into()),
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("path_pipeline_layout"),
            bind_group_layouts: &[*globals_layout],
            immediate_size: 0,
        });

        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("path_pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                compilation_options: Default::default(),
                buffers: &[wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<PathVertex>() as u64,
                    step_mode: wgpu::VertexStepMode::Vertex,
                    attributes: &[
                        wgpu::VertexAttribute {
                            format: wgpu::VertexFormat::Float32x2,
                            offset: 0,
                            shader_location: 0,
                        },
                        wgpu::VertexAttribute {
                            format: wgpu::VertexFormat::Float32x4,
                            offset: 8,
                            shader_location: 1,
                        },
                    ],
                }],
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                compilation_options: Default::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format: framebuffer_format,
                    blend: Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                ..Default::default()
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState {
                count: sample_count,
                ..Default::default()
            },
            multiview_mask: None,
            cache: None,
        });

        Self { pipeline }
    }
}

pub fn tessellate_icon(icon: &ResolvedIcon) -> (Vec<PathVertex>, Vec<u32>) {
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

    let cx = width / 2.0;
    let cy = height / 2.0;

    let mut geometry: VertexBuffers<PathVertex, u32> = VertexBuffers::new();
    let stroke_style = StrokeStyle {
        color: rgb_to_rgba(icon.stroke),
        join: to_lyon_join(icon.line_join),
        line_cap: to_lyon_cap(icon.line_cap),
        width: stroke_width,
    };
    let fill_color = icon
        .fill
        .map(rgb_to_rgba);

    for element in &icon.elements {
        let svg_d = primitive_to_svg(element);
        let Some(ref d) = svg_d else { continue };
        tessellate_svg_path_into(&mut geometry, d, fill_color, Some(&stroke_style));
    }

    for vertex in &mut geometry.vertices {
        vertex.position[0] = vertex.position[0] * sx - cx;
        vertex.position[1] = vertex.position[1] * sy - cy;
    }

    (geometry.vertices, geometry.indices)
}

pub fn tessellate_svg_path(
    d: &str,
    fill_color: Option<[f32; 4]>,
    stroke_style: Option<&StrokeStyle>,
) -> (Vec<PathVertex>, Vec<u32>) {
    let mut geometry: VertexBuffers<PathVertex, u32> = VertexBuffers::new();
    tessellate_svg_path_into(&mut geometry, d, fill_color, stroke_style);
    (geometry.vertices, geometry.indices)
}

fn tessellate_svg_path_into(
    geometry: &mut VertexBuffers<PathVertex, u32>,
    d: &str,
    fill_color: Option<[f32; 4]>,
    stroke_style: Option<&StrokeStyle>,
) {
    let Some(lyon_path) = parse_svg_path(d) else {
        return;
    };

    if let Some(fill_color) = fill_color {
        let mut fill_tess = FillTessellator::new();
        let _ = fill_tess.tessellate_path(
            &lyon_path,
            &FillOptions::default(),
            &mut BuffersBuilder::new(
                geometry,
                VertexCtor {
                    color: fill_color,
                    offset: [0.0, 0.0],
                },
            ),
        );
    }

    if let Some(stroke_style) = stroke_style {
        let mut stroke_tess = StrokeTessellator::new();
        let stroke_opts = StrokeOptions::default()
            .with_line_width(stroke_style.width)
            .with_line_cap(stroke_style.line_cap)
            .with_line_join(stroke_style.join);
        let _ = stroke_tess.tessellate_path(
            &lyon_path,
            &stroke_opts,
            &mut BuffersBuilder::new(
                geometry,
                VertexCtor {
                    color: stroke_style.color,
                    offset: [0.0, 0.0],
                },
            ),
        );
    }
}

fn parse_svg_path(d: &str) -> Option<lyon::path::Path> {
    let mut builder = lyon::path::Path::builder();
    let mut parser = lyon::extra::parser::PathParser::new();
    let mut source = lyon::extra::parser::Source::new(d.chars());
    let opts = ParserOptions::DEFAULT;
    if parser.parse(&opts, &mut source, &mut builder).is_err() {
        return None;
    }
    Some(builder.build())
}

fn rgb_to_rgba((r, g, b): (u8, u8, u8)) -> [f32; 4] {
    [r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0, 1.0]
}

pub fn append_transformed_icon(
    node: &ResolvedNode,
    icon: &ResolvedIcon,
    vertices: &[PathVertex],
    indices: &[u32],
    out_vertices: &mut Vec<PathVertex>,
    out_indices: &mut Vec<u32>,
) {
    append_transformed_geometry(node, icon.width, icon.height, vertices, indices, out_vertices, out_indices);
}

pub fn append_transformed_geometry(
    node: &ResolvedNode,
    width: f64,
    height: f64,
    vertices: &[PathVertex],
    indices: &[u32],
    out_vertices: &mut Vec<PathVertex>,
    out_indices: &mut Vec<u32>,
) {
    if vertices.is_empty() || indices.is_empty() {
        return;
    }

    let angle = (node.rotation as f32).to_radians();
    let cos_a = angle.cos();
    let sin_a = angle.sin();
    let sx = node.scale_x as f32;
    let sy = node.scale_y as f32;
    let skew_x_tan = (node.skew_x as f32).to_radians().tan();
    let skew_y_tan = (node.skew_y as f32).to_radians().tan();

    let m00 = cos_a * sx - sin_a * sy * skew_y_tan;
    let m01 = cos_a * sx * skew_x_tan - sin_a * sy;
    let m10 = sin_a * sx + cos_a * sy * skew_y_tan;
    let m11 = sin_a * sx * skew_x_tan + cos_a * sy;
    let tx = node.x as f32 + width as f32 / 2.0;
    let ty = node.y as f32 + height as f32 / 2.0;
    let opacity = node.opacity.clamp(0.0, 1.0) as f32;
    let base = out_vertices.len() as u32;

    out_vertices.reserve(vertices.len());
    out_indices.reserve(indices.len());

    for vertex in vertices {
        let vertex_alpha = vertex.color[3];
        out_vertices.push(PathVertex {
            position: [
                m00 * vertex.position[0] + m01 * vertex.position[1] + tx,
                m10 * vertex.position[0] + m11 * vertex.position[1] + ty,
            ],
            color: [
                vertex.color[0] * opacity,
                vertex.color[1] * opacity,
                vertex.color[2] * opacity,
                vertex_alpha * opacity,
            ],
        });
    }

    out_indices.extend(indices.iter().map(|index| index + base));
}

pub struct PathBatch;

impl PathBatch {
    pub fn draw<'rp>(
        pipeline: &'rp PathPipeline,
        pass: &mut wgpu::RenderPass<'rp>,
        vertex_buffer: &'rp wgpu::Buffer,
        index_buffer: &'rp wgpu::Buffer,
        vertex_count: usize,
        index_count: usize,
    ) {
        if vertex_count == 0 || index_count == 0 {
            return;
        }

        pass.set_pipeline(&pipeline.pipeline);
        pass.set_vertex_buffer(0, vertex_buffer.slice(..));
        pass.set_index_buffer(index_buffer.slice(..), wgpu::IndexFormat::Uint32);
        pass.draw_indexed(0..index_count as u32, 0, 0..1);
    }
}

fn primitive_to_svg(prim: &IconPrimitive) -> Option<String> {
    match prim {
        IconPrimitive::Path(p) => Some(p.d.clone()),
        IconPrimitive::Circle(c) => {
            let r = c.r;
            Some(format!(
                "M{},{} a{r},{r} 0 1,0 {},0 a{r},{r} 0 1,0 {},0",
                c.cx - r,
                c.cy,
                r * 2.0,
                -(r * 2.0)
            ))
        }
        IconPrimitive::Line(l) => Some(format!("M{} {} L{} {}", l.x1, l.y1, l.x2, l.y2)),
        IconPrimitive::Polyline(pl) => points_to_svg(&pl.points, false),
        IconPrimitive::Polygon(pg) => points_to_svg(&pg.points, true),
        IconPrimitive::Rect(r) => {
            let x = r.x.unwrap_or(0.0);
            let y = r.y.unwrap_or(0.0);
            Some(format!(
                "M{x},{y} L{},{y} L{},{} L{x},{} Z",
                x + r.width,
                x + r.width,
                y + r.height,
                y + r.height
            ))
        }
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

fn to_lyon_cap(cap: IconLineCap) -> lyon::tessellation::LineCap {
    match cap {
        IconLineCap::Butt => lyon::tessellation::LineCap::Butt,
        IconLineCap::Round => lyon::tessellation::LineCap::Round,
        IconLineCap::Square => lyon::tessellation::LineCap::Square,
    }
}

fn to_lyon_join(join: IconLineJoin) -> lyon::tessellation::LineJoin {
    match join {
        IconLineJoin::Bevel => lyon::tessellation::LineJoin::Bevel,
        IconLineJoin::Miter => lyon::tessellation::LineJoin::MiterClip,
        IconLineJoin::Round => lyon::tessellation::LineJoin::Round,
    }
}
