use std::collections::HashMap;

use bytemuck::{Pod, Zeroable};
use lyon::math::point;
use lyon::path::PathEvent;
use lyon::tessellation::{
    BuffersBuilder, FillOptions, FillTessellator, FillVertexConstructor,
    StrokeOptions, StrokeTessellator, StrokeVertexConstructor, VertexBuffers,
};
use wgpu::util::DeviceExt;

use crate::render::apply_node_transform;
use crate::schema::{
    IconCirclePrimitive, IconLineCap, IconLineJoin, IconPrimitive, IconRectPrimitive,
};
use crate::shared::types::{ResolvedIcon, ResolvedNode};

#[repr(C)]
#[derive(Copy, Clone, Pod, Zeroable)]
pub struct PathVertex {
    pub position: [f32; 2],
    pub color: [f32; 4],
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
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });

        Self { pipeline }
    }
}

pub fn tessellate_icon(
    node: &ResolvedNode,
    icon: &ResolvedIcon,
) -> (Vec<PathVertex>, Vec<u32>) {
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

    let opacity = node.opacity.clamp(0.0, 1.0) as f32;

    let angle = (node.rotation as f32).to_radians();
    let cos_a = angle.cos();
    let sin_a = angle.sin();
    let nsx = node.scale_x as f32;
    let nsy = node.scale_y as f32;
    let skew_x_tan = (node.skew_x as f32).to_radians().tan();
    let skew_y_tan = (node.skew_y as f32).to_radians().tan();

    let m00 = cos_a * nsx - sin_a * nsy * skew_y_tan;
    let m01 = cos_a * nsx * skew_x_tan - sin_a * nsy;
    let m10 = sin_a * nsx + cos_a * nsy * skew_y_tan;
    let m11 = sin_a * nsx * skew_x_tan + cos_a * nsy;

    let cx = width / 2.0;
    let cy = height / 2.0;
    let tx = node.x as f32 + cx;
    let ty = node.y as f32 + cy;

    let mut geometry: VertexBuffers<PathVertex, u32> = VertexBuffers::new();
    let mut fill_tess = FillTessellator::new();
    let mut stroke_tess = StrokeTessellator::new();

    let stroke_opts = StrokeOptions::default()
        .with_line_width(stroke_width)
        .with_line_cap(to_lyon_cap(icon.line_cap))
        .with_line_join(to_lyon_join(icon.line_join));

    let stroke_color = {
        let (r, g, b) = icon.stroke;
        [r as f32 / 255.0 * opacity, g as f32 / 255.0 * opacity, b as f32 / 255.0 * opacity, opacity]
    };
    let fill_color = icon.fill.map(|(r, g, b)| {
        [r as f32 / 255.0 * opacity, g as f32 / 255.0 * opacity, b as f32 / 255.0 * opacity, opacity]
    });

    for element in &icon.elements {
        let svg_d = primitive_to_svg(element);
        let Some(ref d) = svg_d else { continue };
        let Ok(path) = lyon::extra::parser::parse(d) else { continue };
        let events: Vec<PathEvent> = path.collect();
        let mut builder = lyon::path::Path::builder();
        for event in &events {
            builder.path_event(*event);
        }
        let lyon_path = builder.build();

        if let Some(fc) = fill_color {
            let _ = fill_tess.tessellate_path(
                &lyon_path,
                &FillOptions::default(),
                &mut BuffersBuilder::new(&mut geometry, VertexCtor { color: fc, offset: [0.0, 0.0] }),
            );
        }

        let _ = stroke_tess.tessellate_path(
            &lyon_path,
            &stroke_opts,
            &mut BuffersBuilder::new(&mut geometry, VertexCtor { color: stroke_color, offset: [0.0, 0.0] }),
        );
    }

    for v in &mut geometry.vertices {
        let lx = v.position[0] * sx - cx;
        let ly = v.position[1] * sy - cy;
        v.position[0] = m00 * lx + m01 * ly + tx;
        v.position[1] = m10 * lx + m11 * ly + ty;
    }

    (geometry.vertices, geometry.indices)
}

pub struct PathBatch;

impl PathBatch {
    pub fn draw<'rp>(
        pipeline: &'rp PathPipeline,
        pass: &mut wgpu::RenderPass<'rp>,
        device: &wgpu::Device,
        vertices: &[PathVertex],
        indices: &[u32],
    ) {
        if vertices.is_empty() || indices.is_empty() {
            return;
        }

        let vbuf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("path_vbuf"),
            contents: bytemuck::cast_slice(vertices),
            usage: wgpu::BufferUsages::VERTEX,
        });
        let ibuf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("path_ibuf"),
            contents: bytemuck::cast_slice(indices),
            usage: wgpu::BufferUsages::INDEX,
        });

        pass.set_pipeline(&pipeline.pipeline);
        pass.set_vertex_buffer(0, vbuf.slice(..));
        pass.set_index_buffer(ibuf.slice(..), wgpu::IndexFormat::Uint32);
        pass.draw_indexed(0..indices.len() as u32, 0, 0..1);
    }
}

fn primitive_to_svg(prim: &IconPrimitive) -> Option<String> {
    match prim {
        IconPrimitive::Path(p) => Some(p.d.clone()),
        IconPrimitive::Circle(c) => {
            let r = c.r;
            Some(format!(
                "M{},{} a{r},{r} 0 1,0 {},0 a{r},{r} 0 1,0 {},0",
                c.cx - r, c.cy, r * 2.0, -(r * 2.0)
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
                x + r.width, x + r.width, y + r.height, y + r.height
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
