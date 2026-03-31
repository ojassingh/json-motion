use bytemuck::{Pod, Zeroable};
use wgpu::util::DeviceExt;

use crate::shared::types::{ResolvedNode, ResolvedRect};

// ── Instance layout ───────────────────────────────────────────────────────────

/// Per-rect instance data uploaded to the GPU.
///
/// The 2-D affine transform `T(p) = mat * p + translation` where `p` is
/// the local coordinate relative to the rect centre (in pixels).
///
/// `mat` is stored in column-major order:
///   mat_col0 = (m00, m10)
///   mat_col1 = (m01, m11)
#[repr(C)]
#[derive(Copy, Clone, Pod, Zeroable)]
pub struct RectInstance {
    pub mat_col0: [f32; 2],     // 8 bytes
    pub mat_col1: [f32; 2],     // 8 bytes
    pub translation: [f32; 2],  // 8 bytes  — world-space centre (pixels)
    pub half_size: [f32; 2],    // 8 bytes  — (w/2, h/2)
    pub corner_radius: f32,     // 4 bytes
    pub opacity: f32,           // 4 bytes
    pub stroke_width: f32,      // 4 bytes
    pub has_fill: f32,          // 4 bytes  — 1.0 / 0.0
    pub has_stroke: f32,        // 4 bytes  — 1.0 / 0.0
    pub _pad: f32,              // 4 bytes
    pub fill_color: [f32; 4],   // 16 bytes
    pub stroke_color: [f32; 4], // 16 bytes
}
// Total: 88 bytes, 4-byte aligned.

impl RectInstance {
    /// Build from a resolved node + its rect data.
    /// Matches the transform logic of `render::apply_node_transform`.
    pub fn from_node(node: &ResolvedNode, rect: &ResolvedRect) -> Self {
        let w = rect.width as f32;
        let h = rect.height as f32;
        let cx = w / 2.0;
        let cy = h / 2.0;

        let angle = (node.rotation as f32).to_radians();
        let cos_a = angle.cos();
        let sin_a = angle.sin();
        let sx = node.scale_x as f32;
        let sy = node.scale_y as f32;
        let skew_x = (node.skew_x as f32).to_radians().tan();
        let skew_y = (node.skew_y as f32).to_radians().tan();

        // M = R * S * Skew  (matches apply_node_transform order)
        // S * Skew = [[sx, sx*skew_x], [sy*skew_y, sy]]
        // R * S * Skew:
        let m00 = cos_a * sx - sin_a * sy * skew_y;
        let m01 = cos_a * sx * skew_x - sin_a * sy;
        let m10 = sin_a * sx + cos_a * sy * skew_y;
        let m11 = sin_a * sx * skew_x + cos_a * sy;

        // World centre = (node.x + cx, node.y + cy)
        let tx = node.x as f32 + cx;
        let ty = node.y as f32 + cy;

        let opacity = node.opacity.clamp(0.0, 1.0) as f32;

        let (fill_color, has_fill) = match rect.fill {
            Some((r, g, b)) => (
                [r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0, 1.0],
                1.0_f32,
            ),
            None => ([0.0_f32; 4], 0.0),
        };

        let (stroke_color, has_stroke) = match rect.stroke {
            Some((r, g, b)) if rect.stroke_width > 0.0 => (
                [r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0, 1.0],
                1.0_f32,
            ),
            _ => ([0.0_f32; 4], 0.0),
        };

        Self {
            mat_col0: [m00, m10],
            mat_col1: [m01, m11],
            translation: [tx, ty],
            half_size: [cx, cy],
            corner_radius: (rect.corner_radius as f32).min(cx).min(cy),
            opacity,
            stroke_width: rect.stroke_width as f32,
            has_fill,
            has_stroke,
            _pad: 0.0,
            fill_color,
            stroke_color,
        }
    }

    /// Vertex buffer attribute descriptors for the instance buffer (slot 1).
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
        attr!(wgpu::VertexFormat::Float32x2, 8); // half_size
        attr!(wgpu::VertexFormat::Float32, 4); // corner_radius
        attr!(wgpu::VertexFormat::Float32, 4); // opacity
        attr!(wgpu::VertexFormat::Float32, 4); // stroke_width
        attr!(wgpu::VertexFormat::Float32, 4); // has_fill
        attr!(wgpu::VertexFormat::Float32, 4); // has_stroke
        attr!(wgpu::VertexFormat::Float32, 4); // _pad
        attr!(wgpu::VertexFormat::Float32x4, 16); // fill_color
        attr!(wgpu::VertexFormat::Float32x4, 16); // stroke_color

        let _ = (offset, loc);
        attrs
    }
}

// ── Unit quad ─────────────────────────────────────────────────────────────────

/// Six vertices forming two triangles covering [-0.5, 0.5]².
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

// ── RectPipeline ─────────────────────────────────────────────────────────────

/// Owns the wgpu render pipeline and the static quad vertex buffer.
pub struct RectPipeline {
    pub pipeline: wgpu::RenderPipeline,
    pub quad_vbuf: wgpu::Buffer,
}

impl RectPipeline {
    pub fn new(
        device: &wgpu::Device,
        framebuffer_format: wgpu::TextureFormat,
        sample_count: u32,
        globals_layout: &Option<&wgpu::BindGroupLayout>,
    ) -> Self {
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("rect_shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("shaders/rect.wgsl").into()),
        });

        // wgpu 29: bind_group_layouts is &[Option<&BindGroupLayout>], no push_constant_ranges
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("rect_pipeline_layout"),
            bind_group_layouts: &[*globals_layout],
            immediate_size: 0,
        });

        let instance_attrs = RectInstance::vertex_attributes(1);

        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("rect_pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                compilation_options: Default::default(),
                buffers: &[
                    // Slot 0: unit quad vertices
                    wgpu::VertexBufferLayout {
                        array_stride: std::mem::size_of::<QuadVertex>() as u64,
                        step_mode: wgpu::VertexStepMode::Vertex,
                        attributes: &[wgpu::VertexAttribute {
                            format: wgpu::VertexFormat::Float32x2,
                            offset: 0,
                            shader_location: 0,
                        }],
                    },
                    // Slot 1: per-instance data
                    wgpu::VertexBufferLayout {
                        array_stride: std::mem::size_of::<RectInstance>() as u64,
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
            // wgpu 29: multiview → multiview_mask
            multiview_mask: None,
            cache: None,
        });

        let quad_vbuf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("quad_vbuf"),
            contents: bytemuck::cast_slice(QUAD_VERTS),
            usage: wgpu::BufferUsages::VERTEX,
        });

        Self {
            pipeline,
            quad_vbuf,
        }
    }
}

// ── RectBatch ─────────────────────────────────────────────────────────────────

/// Collects `RectInstance`s for a frame and issues a single instanced draw.
pub struct RectBatch;

impl RectBatch {
    /// Draw `instances` in a single instanced draw call.
    pub fn draw<'rp>(
        pipeline: &'rp RectPipeline,
        pass: &mut wgpu::RenderPass<'rp>,
        instance_buf: &'rp wgpu::Buffer,
        instances: &[RectInstance],
    ) {
        if instances.is_empty() {
            return;
        }

        pass.set_pipeline(&pipeline.pipeline);
        pass.set_vertex_buffer(0, pipeline.quad_vbuf.slice(..));
        pass.set_vertex_buffer(1, instance_buf.slice(..));
        pass.draw(0..6, 0..instances.len() as u32);
    }
}
