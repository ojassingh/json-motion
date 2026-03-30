mod atlas;
mod readback;
mod rect;
mod text_pipeline;

use bytemuck::{Pod, Zeroable};
use wgpu::util::DeviceExt;

use crate::render::{CpuSkiaBackend, FrameBuffer, RenderBackend};
use crate::shared::types::{ResolvedFrame, ResolvedNode, ResolvedNodeData, ResolvedText};
use crate::text::TextMeasurer;

use readback::ReadbackBuffer;
use rect::{RectBatch, RectInstance, RectPipeline};
use text_pipeline::{TextBatch, TextInstance, TextPipeline};

/// RGBA8 linear — same channel order as ffmpeg's `Pixel::RGBA`.
const FRAMEBUFFER_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

// ── Globals uniform ───────────────────────────────────────────────────────────

#[repr(C)]
#[derive(Copy, Clone, Pod, Zeroable)]
struct Globals {
    canvas_size: [f32; 2],
    _pad: [f32; 2],
}

// ── WgpuBackend ───────────────────────────────────────────────────────────────

/// GPU render backend backed by wgpu.
///
/// Phase 1: only `ResolvedNodeData::Rect` nodes are handled on the GPU.
/// Any frame that contains text or icon nodes falls back to `CpuSkiaBackend`
/// so output is always correct.  Text and icons will be accelerated in
/// Phases 2 and 3.
pub struct WgpuBackend {
    device: wgpu::Device,
    queue: wgpu::Queue,
    framebuffer: wgpu::Texture,
    framebuffer_view: wgpu::TextureView,
    readback: ReadbackBuffer,
    rect_pipeline: RectPipeline,
    text_pipeline: TextPipeline,
    atlas_sampler: wgpu::Sampler,
    globals_buf: wgpu::Buffer,
    globals_bind_group: wgpu::BindGroup,
    cpu_fallback: CpuSkiaBackend,
    fb_width: u32,
    fb_height: u32,
}

impl WgpuBackend {
    /// Initialise a wgpu device and all GPU resources for the given canvas size.
    /// Returns `Err` if no suitable GPU adapter is found.
    pub fn new(width: u32, height: u32) -> Result<Self, String> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            flags: wgpu::InstanceFlags::default(),
            memory_budget_thresholds: Default::default(),
            backend_options: Default::default(),
            display: None,
        });

        let adapter = pollster::block_on(instance.request_adapter(
            &wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: None,
                force_fallback_adapter: false,
            },
        ))
        .map_err(|e| format!("no suitable GPU adapter found: {e}"))?;

        let (device, queue) = pollster::block_on(adapter.request_device(
            &wgpu::DeviceDescriptor {
                label: Some("engine"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::default(),
                experimental_features: wgpu::ExperimentalFeatures::disabled(),
                memory_hints: Default::default(),
                trace: wgpu::Trace::Off,
            },
        ))
        .map_err(|e| format!("failed to create wgpu device: {e}"))?;

        let globals_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("globals_layout"),
                entries: &[wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                }],
            });
        // wgpu 29: bind_group_layouts takes &[Option<&BindGroupLayout>]
        let globals_layout_opt = Some(&globals_layout);

        let globals_data = Globals {
            canvas_size: [width as f32, height as f32],
            _pad: [0.0; 2],
        };
        let globals_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("globals"),
            contents: bytemuck::bytes_of(&globals_data),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        let globals_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("globals_bg"),
            layout: &globals_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: globals_buf.as_entire_binding(),
            }],
        });

        let rect_pipeline =
            RectPipeline::new(&device, FRAMEBUFFER_FORMAT, &globals_layout_opt);
        let text_pipeline =
            TextPipeline::new(&device, FRAMEBUFFER_FORMAT, &globals_layout_opt);

        let atlas_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("atlas_sampler"),
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });

        let (framebuffer, framebuffer_view) = make_framebuffer(&device, width, height);
        let readback = ReadbackBuffer::new(&device, width, height);

        Ok(Self {
            device,
            queue,
            framebuffer,
            framebuffer_view,
            readback,
            rect_pipeline,
            text_pipeline,
            atlas_sampler,
            globals_buf,
            globals_bind_group,
            cpu_fallback: CpuSkiaBackend::new(),
            fb_width: width,
            fb_height: height,
        })
    }

    /// Recreate dimension-dependent resources when the canvas size changes
    /// (rare — typically never for a single video render).
    fn ensure_dims(&mut self, width: u32, height: u32) {
        if self.fb_width == width && self.fb_height == height {
            return;
        }
        let (fb, view) = make_framebuffer(&self.device, width, height);
        self.framebuffer = fb;
        self.framebuffer_view = view;
        self.readback = ReadbackBuffer::new(&self.device, width, height);

        let globals_data = Globals {
            canvas_size: [width as f32, height as f32],
            _pad: [0.0; 2],
        };
        self.queue.write_buffer(
            &self.globals_buf,
            0,
            bytemuck::bytes_of(&globals_data),
        );

        self.fb_width = width;
        self.fb_height = height;
    }

    fn render_gpu(
        &mut self,
        frame: &ResolvedFrame,
        target: &mut FrameBuffer,
        measurer: &dyn TextMeasurer,
    ) -> Result<(), String> {
        let (bg_r, bg_g, bg_b) = frame.background;
        let bg_color = wgpu::Color {
            r: bg_r as f64 / 255.0,
            g: bg_g as f64 / 255.0,
            b: bg_b as f64 / 255.0,
            a: 1.0,
        };

        let rect_instances: Vec<RectInstance> = frame
            .nodes
            .iter()
            .filter_map(|node| {
                if let ResolvedNodeData::Rect(rect) = &node.data {
                    Some(RectInstance::from_node(node, rect))
                } else {
                    None
                }
            })
            .collect();

        let text_nodes: Vec<(usize, &ResolvedNode, &ResolvedText)> = frame
            .nodes
            .iter()
            .enumerate()
            .filter_map(|(i, node)| {
                if let ResolvedNodeData::Text(t) = &node.data {
                    Some((i, node, t))
                } else {
                    None
                }
            })
            .collect();

        let atlas_build = atlas::build_text_atlas(&text_nodes, measurer);

        let (_atlas_texture, _atlas_view, atlas_bg, text_instances) =
            if let Some(ref ab) = atlas_build {
                let tex = self.device.create_texture(&wgpu::TextureDescriptor {
                    label: Some("glyph_atlas"),
                    size: wgpu::Extent3d {
                        width: ab.width,
                        height: ab.height,
                        depth_or_array_layers: 1,
                    },
                    mip_level_count: 1,
                    sample_count: 1,
                    dimension: wgpu::TextureDimension::D2,
                    format: wgpu::TextureFormat::R8Unorm,
                    usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
                    view_formats: &[],
                });
                self.queue.write_texture(
                    wgpu::TexelCopyTextureInfo {
                        texture: &tex,
                        mip_level: 0,
                        origin: wgpu::Origin3d::ZERO,
                        aspect: wgpu::TextureAspect::All,
                    },
                    &ab.pixels,
                    wgpu::TexelCopyBufferLayout {
                        offset: 0,
                        bytes_per_row: Some(ab.width),
                        rows_per_image: Some(ab.height),
                    },
                    wgpu::Extent3d {
                        width: ab.width,
                        height: ab.height,
                        depth_or_array_layers: 1,
                    },
                );
                let view = tex.create_view(&wgpu::TextureViewDescriptor::default());
                let bg = self.text_pipeline.create_atlas_bind_group(
                    &self.device,
                    &view,
                    &self.atlas_sampler,
                );

                let aw = ab.width as f32;
                let ah = ab.height as f32;
                let mut instances = Vec::new();
                for entry in &ab.entries {
                    let node = &frame.nodes[entry.node_idx];
                    for line in &entry.lines {
                        instances.push(TextInstance::from_line(node, line, aw, ah));
                    }
                }

                (Some(tex), Some(view), Some(bg), instances)
            } else {
                (None, None, None, Vec::new())
            };

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("frame_encoder"),
            });

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("frame_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.framebuffer_view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(bg_color),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });

            pass.set_bind_group(0, &self.globals_bind_group, &[]);
            RectBatch::draw(&self.rect_pipeline, &mut pass, &self.device, &rect_instances);

            if let Some(ref bg) = atlas_bg {
                TextBatch::draw(
                    &self.text_pipeline,
                    &mut pass,
                    &self.device,
                    bg,
                    &text_instances,
                );
            }
        }

        self.readback.copy_from_texture(
            &mut encoder,
            &self.framebuffer,
            target.width(),
            target.height(),
        );
        self.queue.submit(std::iter::once(encoder.finish()));

        self.readback.map_and_copy(&self.device, target)
    }
}

impl RenderBackend for WgpuBackend {
    fn render_into(
        &mut self,
        frame: &ResolvedFrame,
        target: &mut FrameBuffer,
        measurer: &dyn TextMeasurer,
    ) -> Result<(), String> {
        self.ensure_dims(target.width(), target.height());

        let has_icons = frame
            .nodes
            .iter()
            .any(|n| matches!(n.data, ResolvedNodeData::Icon(_)));

        if has_icons {
            self.cpu_fallback.render_into(frame, target, measurer)
        } else {
            self.render_gpu(frame, target, measurer)
        }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn make_framebuffer(
    device: &wgpu::Device,
    width: u32,
    height: u32,
) -> (wgpu::Texture, wgpu::TextureView) {
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("framebuffer"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: FRAMEBUFFER_FORMAT,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    (texture, view)
}
