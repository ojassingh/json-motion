use bytemuck::{Pod, Zeroable};
use wgpu::util::DeviceExt;

use crate::scene::types::ResolvedNode;

use super::atlas::TextLineEntry;

#[repr(C)]
#[derive(Copy, Clone, Pod, Zeroable)]
pub struct TextInstance {
    pub mat_col0: [f32; 2],
    pub mat_col1: [f32; 2],
    pub translation: [f32; 2],
    pub glyph_size: [f32; 2],
    pub uv_origin: [f32; 2],
    pub uv_extent: [f32; 2],
    pub color: [f32; 4],
}

impl TextInstance {
    pub fn from_line(
        node: &ResolvedNode,
        entry: &TextLineEntry,
        atlas_w: f32,
        atlas_h: f32,
    ) -> Self {
        let angle = (node.rotation as f32).to_radians();
        let cos_a = angle.cos();
        let sin_a = angle.sin();
        let sx = node.scale_x as f32;
        let sy = node.scale_y as f32;
        let skew_x = (node.skew_x as f32).to_radians().tan();
        let skew_y = (node.skew_y as f32).to_radians().tan();

        let m00 = cos_a * sx - sin_a * sy * skew_y;
        let m01 = cos_a * sx * skew_x - sin_a * sy;
        let m10 = sin_a * sx + cos_a * sy * skew_y;
        let m11 = sin_a * sx * skew_x + cos_a * sy;

        let gw = entry.region.w as f32;
        let gh = entry.region.h as f32;
        let local_cx = entry.local_x + gw / 2.0;
        let local_cy = entry.local_y + gh / 2.0;

        let opacity = node.opacity.clamp(0.0, 1.0) as f32;
        let (r, g, b) = if let crate::scene::types::ResolvedNodeData::Text(t) = &node.data {
            (
                t.color.0 as f32 / 255.0,
                t.color.1 as f32 / 255.0,
                t.color.2 as f32 / 255.0,
            )
        } else {
            (1.0, 1.0, 1.0)
        };

        Self {
            mat_col0: [m00, m10],
            mat_col1: [m01, m11],
            translation: [
                m00 * local_cx + m01 * local_cy + node.x as f32,
                m10 * local_cx + m11 * local_cy + node.y as f32,
            ],
            glyph_size: [gw, gh],
            uv_origin: [
                entry.region.x as f32 / atlas_w,
                entry.region.y as f32 / atlas_h,
            ],
            uv_extent: [gw / atlas_w, gh / atlas_h],
            color: [r * opacity, g * opacity, b * opacity, opacity],
        }
    }

    pub fn vertex_attributes(start_location: u32) -> Vec<wgpu::VertexAttribute> {
        let mut attrs = Vec::new();
        let mut offset = 0u64;
        let mut loc = start_location;

        macro_rules! attr {
            ($fmt:expr, $size:expr) => {
                attrs.push(wgpu::VertexAttribute {
                    format: $fmt,
                    offset,
                    shader_location: loc,
                });
                offset += $size;
                loc += 1;
            };
        }

        attr!(wgpu::VertexFormat::Float32x2, 8); // mat_col0
        attr!(wgpu::VertexFormat::Float32x2, 8); // mat_col1
        attr!(wgpu::VertexFormat::Float32x2, 8); // translation
        attr!(wgpu::VertexFormat::Float32x2, 8); // glyph_size
        attr!(wgpu::VertexFormat::Float32x2, 8); // uv_origin
        attr!(wgpu::VertexFormat::Float32x2, 8); // uv_extent
        attr!(wgpu::VertexFormat::Float32x4, 16); // color

        let _ = (offset, loc);
        attrs
    }
}

#[repr(C)]
#[derive(Copy, Clone, Pod, Zeroable)]
struct QuadVertex {
    pos: [f32; 2],
}

const QUAD_VERTS: &[QuadVertex] = &[
    QuadVertex { pos: [-0.5, -0.5] },
    QuadVertex { pos: [0.5, -0.5] },
    QuadVertex { pos: [0.5, 0.5] },
    QuadVertex { pos: [-0.5, -0.5] },
    QuadVertex { pos: [0.5, 0.5] },
    QuadVertex { pos: [-0.5, 0.5] },
];

pub struct TextPipeline {
    pub pipeline: wgpu::RenderPipeline,
    pub quad_vbuf: wgpu::Buffer,
    pub atlas_bind_group_layout: wgpu::BindGroupLayout,
}

impl TextPipeline {
    pub fn new(
        device: &wgpu::Device,
        framebuffer_format: wgpu::TextureFormat,
        sample_count: u32,
        globals_layout: &Option<&wgpu::BindGroupLayout>,
    ) -> Self {
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("text_shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("shaders/text.wgsl").into()),
        });

        let atlas_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("atlas_bgl"),
                entries: &[
                    wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                ],
            });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("text_pipeline_layout"),
            bind_group_layouts: &[*globals_layout, Some(&atlas_bind_group_layout)],
            immediate_size: 0,
        });

        let instance_attrs = TextInstance::vertex_attributes(1);

        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("text_pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                compilation_options: Default::default(),
                buffers: &[
                    wgpu::VertexBufferLayout {
                        array_stride: std::mem::size_of::<QuadVertex>() as u64,
                        step_mode: wgpu::VertexStepMode::Vertex,
                        attributes: &[wgpu::VertexAttribute {
                            format: wgpu::VertexFormat::Float32x2,
                            offset: 0,
                            shader_location: 0,
                        }],
                    },
                    wgpu::VertexBufferLayout {
                        array_stride: std::mem::size_of::<TextInstance>() as u64,
                        step_mode: wgpu::VertexStepMode::Instance,
                        attributes: &instance_attrs,
                    },
                ],
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

        let quad_vbuf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("text_quad_vbuf"),
            contents: bytemuck::cast_slice(QUAD_VERTS),
            usage: wgpu::BufferUsages::VERTEX,
        });

        Self {
            pipeline,
            quad_vbuf,
            atlas_bind_group_layout,
        }
    }

    pub fn create_atlas_bind_group(
        &self,
        device: &wgpu::Device,
        atlas_view: &wgpu::TextureView,
        sampler: &wgpu::Sampler,
    ) -> wgpu::BindGroup {
        device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("atlas_bg"),
            layout: &self.atlas_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(atlas_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(sampler),
                },
            ],
        })
    }
}

pub struct TextBatch;

impl TextBatch {
    pub fn draw<'rp>(
        pipeline: &'rp TextPipeline,
        pass: &mut wgpu::RenderPass<'rp>,
        atlas_bg: &'rp wgpu::BindGroup,
        instance_buf: &'rp wgpu::Buffer,
        instance_count: usize,
    ) {
        if instance_count == 0 {
            return;
        }

        pass.set_pipeline(&pipeline.pipeline);
        pass.set_bind_group(1, atlas_bg, &[]);
        pass.set_vertex_buffer(0, pipeline.quad_vbuf.slice(..));
        pass.set_vertex_buffer(1, instance_buf.slice(..));
        pass.draw(0..6, 0..instance_count as u32);
    }
}
