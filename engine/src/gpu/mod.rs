mod atlas;
mod path_pipeline;
mod readback;
mod rect;
mod text_pipeline;

use std::collections::HashMap;
use std::hash::{DefaultHasher, Hash, Hasher};

use bytemuck::{Pod, Zeroable};
use wgpu::util::DeviceExt;

use crate::render::{FrameBuffer, RenderBackend};
use crate::shared::types::{ResolvedFrame, ResolvedNode, ResolvedNodeData, ResolvedText};
use crate::text::TextMeasurer;

use path_pipeline::{PathBatch, PathPipeline, PathVertex};
use readback::ReadbackBuffer;
use rect::{RectBatch, RectInstance, RectPipeline};
use text_pipeline::{TextBatch, TextInstance, TextPipeline};

/// RGBA8 linear — same channel order as ffmpeg's `Pixel::RGBA`.
const FRAMEBUFFER_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
const MSAA_SAMPLE_COUNT: u32 = 4;

// ── Globals uniform ───────────────────────────────────────────────────────────

#[repr(C)]
#[derive(Copy, Clone, Pod, Zeroable)]
struct Globals {
    canvas_size: [f32; 2],
    _pad: [f32; 2],
}

struct ReusableBuffer {
    buffer: Option<wgpu::Buffer>,
    capacity_bytes: usize,
    label: &'static str,
    usage: wgpu::BufferUsages,
}

impl ReusableBuffer {
    fn new(label: &'static str, usage: wgpu::BufferUsages) -> Self {
        Self {
            buffer: None,
            capacity_bytes: 0,
            label,
            usage,
        }
    }

    fn write<T: Pod>(&mut self, device: &wgpu::Device, queue: &wgpu::Queue, data: &[T]) {
        if data.is_empty() {
            return;
        }

        let bytes = bytemuck::cast_slice(data);
        let required_bytes = bytes.len();
        if self.capacity_bytes < required_bytes {
            self.capacity_bytes = required_bytes.next_power_of_two().max(256);
            self.buffer = Some(device.create_buffer(&wgpu::BufferDescriptor {
                label: Some(self.label),
                size: self.capacity_bytes as u64,
                usage: self.usage | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            }));
        }

        if let Some(buffer) = self.buffer.as_ref() {
            queue.write_buffer(buffer, 0, bytes);
        }
    }

    fn get(&self) -> Option<&wgpu::Buffer> {
        self.buffer.as_ref()
    }
}

struct TextAtlasCache {
    bind_group: wgpu::BindGroup,
    entries: Vec<atlas::TextNodeEntry>,
    height: u32,
    key: u64,
    _texture: wgpu::Texture,
    width: u32,
}

struct CachedPathGeometry {
    indices: Vec<u32>,
    vertices: Vec<PathVertex>,
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
    msaa_framebuffer: wgpu::Texture,
    msaa_framebuffer_view: wgpu::TextureView,
    readback: ReadbackBuffer,
    rect_pipeline: RectPipeline,
    text_pipeline: TextPipeline,
    path_pipeline: PathPipeline,
    atlas_sampler: wgpu::Sampler,
    globals_buf: wgpu::Buffer,
    globals_bind_group: wgpu::BindGroup,
    fb_width: u32,
    fb_height: u32,
    rect_instances: ReusableBuffer,
    text_instances: ReusableBuffer,
    path_vertices: ReusableBuffer,
    path_indices: ReusableBuffer,
    text_atlas_cache: Option<TextAtlasCache>,
    path_cache: HashMap<u64, CachedPathGeometry>,
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

        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: None,
            force_fallback_adapter: false,
        }))
        .map_err(|e| format!("no suitable GPU adapter found: {e}"))?;

        let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
            label: Some("engine"),
            required_features: wgpu::Features::empty(),
            required_limits: wgpu::Limits::default(),
            experimental_features: wgpu::ExperimentalFeatures::disabled(),
            memory_hints: Default::default(),
            trace: wgpu::Trace::Off,
        }))
        .map_err(|e| format!("failed to create wgpu device: {e}"))?;

        let globals_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
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

        let rect_pipeline = RectPipeline::new(
            &device,
            FRAMEBUFFER_FORMAT,
            MSAA_SAMPLE_COUNT,
            &globals_layout_opt,
        );
        let text_pipeline = TextPipeline::new(
            &device,
            FRAMEBUFFER_FORMAT,
            MSAA_SAMPLE_COUNT,
            &globals_layout_opt,
        );
        let path_pipeline = PathPipeline::new(
            &device,
            FRAMEBUFFER_FORMAT,
            MSAA_SAMPLE_COUNT,
            &globals_layout_opt,
        );

        let atlas_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("atlas_sampler"),
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });

        let (framebuffer, framebuffer_view, msaa_framebuffer, msaa_framebuffer_view) =
            make_framebuffers(&device, width, height);
        let readback = ReadbackBuffer::new(&device, width, height);

        Ok(Self {
            device,
            queue,
            framebuffer,
            framebuffer_view,
            msaa_framebuffer,
            msaa_framebuffer_view,
            readback,
            rect_pipeline,
            text_pipeline,
            path_pipeline,
            atlas_sampler,
            globals_buf,
            globals_bind_group,
            fb_width: width,
            fb_height: height,
            rect_instances: ReusableBuffer::new("rect_instances", wgpu::BufferUsages::VERTEX),
            text_instances: ReusableBuffer::new("text_instances", wgpu::BufferUsages::VERTEX),
            path_vertices: ReusableBuffer::new("path_vbuf", wgpu::BufferUsages::VERTEX),
            path_indices: ReusableBuffer::new("path_ibuf", wgpu::BufferUsages::INDEX),
            text_atlas_cache: None,
            path_cache: HashMap::new(),
        })
    }
    fn ensure_dims(&mut self, width: u32, height: u32) {
        if self.fb_width == width && self.fb_height == height {
            return;
        }
        let (fb, view, msaa_fb, msaa_view) = make_framebuffers(&self.device, width, height);
        self.framebuffer = fb;
        self.framebuffer_view = view;
        self.msaa_framebuffer = msaa_fb;
        self.msaa_framebuffer_view = msaa_view;
        self.readback = ReadbackBuffer::new(&self.device, width, height);

        let globals_data = Globals {
            canvas_size: [width as f32, height as f32],
            _pad: [0.0; 2],
        };
        self.queue
            .write_buffer(&self.globals_buf, 0, bytemuck::bytes_of(&globals_data));

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

        let text_nodes: Vec<(&ResolvedNode, &ResolvedText)> = frame
            .nodes
            .iter()
            .filter_map(|node| {
                if let ResolvedNodeData::Text(t) = &node.data {
                    Some((node, t))
                } else {
                    None
                }
            })
            .collect();

        let mut all_path_verts: Vec<PathVertex> = Vec::new();
        let mut all_path_indices: Vec<u32> = Vec::new();
        for node in &frame.nodes {
            if let ResolvedNodeData::Icon(icon) = &node.data {
                let cache_key = hash_icon(icon);
                let cached = self.path_cache.entry(cache_key).or_insert_with(|| {
                    let (vertices, indices) = path_pipeline::tessellate_icon(icon);
                    CachedPathGeometry { vertices, indices }
                });
                path_pipeline::append_transformed_icon(
                    node,
                    icon,
                    &cached.vertices,
                    &cached.indices,
                    &mut all_path_verts,
                    &mut all_path_indices,
                );
            }
        }

        if !text_nodes.is_empty() {
            let atlas_key = hash_text_nodes(&text_nodes);
            let should_rebuild = self
                .text_atlas_cache
                .as_ref()
                .is_none_or(|cache| cache.key != atlas_key);

            if should_rebuild {
                self.text_atlas_cache = atlas::build_text_atlas(&text_nodes, measurer).map(|ab| {
                    let texture = self.device.create_texture(&wgpu::TextureDescriptor {
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
                            texture: &texture,
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
                    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
                    let bind_group = self.text_pipeline.create_atlas_bind_group(
                        &self.device,
                        &view,
                        &self.atlas_sampler,
                    );
                    TextAtlasCache {
                        bind_group,
                        entries: ab.entries,
                        height: ab.height,
                        key: atlas_key,
                        _texture: texture,
                        width: ab.width,
                    }
                });
            }
        }

        let text_node_lookup: HashMap<usize, &ResolvedNode> = text_nodes
            .iter()
            .map(|(node, _)| (node.source_index, *node))
            .collect();
        let mut text_instances = Vec::new();
        if let Some(cache) = self.text_atlas_cache.as_ref() {
            let atlas_width = cache.width as f32;
            let atlas_height = cache.height as f32;
            for entry in &cache.entries {
                if let Some(node) = text_node_lookup.get(&entry.source_index) {
                    for line in &entry.lines {
                        text_instances.push(TextInstance::from_line(
                            node,
                            line,
                            atlas_width,
                            atlas_height,
                        ));
                    }
                }
            }
        }

        self.rect_instances
            .write(&self.device, &self.queue, &rect_instances);
        self.text_instances
            .write(&self.device, &self.queue, &text_instances);
        self.path_vertices
            .write(&self.device, &self.queue, &all_path_verts);
        self.path_indices
            .write(&self.device, &self.queue, &all_path_indices);

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("frame_encoder"),
            });

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("frame_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.msaa_framebuffer_view,
                    resolve_target: Some(&self.framebuffer_view),
                    depth_slice: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(bg_color),
                        store: wgpu::StoreOp::Discard,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });

            pass.set_bind_group(0, &self.globals_bind_group, &[]);
            if let Some(rect_buffer) = self.rect_instances.get() {
                RectBatch::draw(&self.rect_pipeline, &mut pass, rect_buffer, &rect_instances);
            }

            if let (Some(cache), Some(text_buffer)) =
                (self.text_atlas_cache.as_ref(), self.text_instances.get())
            {
                TextBatch::draw(
                    &self.text_pipeline,
                    &mut pass,
                    &cache.bind_group,
                    text_buffer,
                    &text_instances,
                );
            }

            if let (Some(path_vertex_buffer), Some(path_index_buffer)) =
                (self.path_vertices.get(), self.path_indices.get())
            {
                PathBatch::draw(
                    &self.path_pipeline,
                    &mut pass,
                    path_vertex_buffer,
                    path_index_buffer,
                    &all_path_verts,
                    &all_path_indices,
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

fn hash_text_nodes(nodes: &[(&ResolvedNode, &ResolvedText)]) -> u64 {
    let mut hasher = DefaultHasher::new();
    for (node, text) in nodes {
        node.source_index.hash(&mut hasher);
        text.text.hash(&mut hasher);
        text.font_family.hash(&mut hasher);
        text.font_size.to_bits().hash(&mut hasher);
        text.line_height.to_bits().hash(&mut hasher);
        text.max_width.map(f64::to_bits).hash(&mut hasher);
        hash_text_align(text.text_align, &mut hasher);
    }
    hasher.finish()
}

fn hash_icon(icon: &crate::shared::types::ResolvedIcon) -> u64 {
    let mut hasher = DefaultHasher::new();
    icon.width.to_bits().hash(&mut hasher);
    icon.height.to_bits().hash(&mut hasher);
    icon.viewport_width.to_bits().hash(&mut hasher);
    icon.viewport_height.to_bits().hash(&mut hasher);
    icon.stroke.hash(&mut hasher);
    icon.fill.hash(&mut hasher);
    icon.stroke_width.to_bits().hash(&mut hasher);
    icon.absolute_stroke_width.hash(&mut hasher);
    hash_line_cap(icon.line_cap, &mut hasher);
    hash_line_join(icon.line_join, &mut hasher);
    for element in &icon.elements {
        hash_icon_primitive(element, &mut hasher);
    }
    hasher.finish()
}

fn hash_text_align(align: crate::schema::TextAlign, hasher: &mut DefaultHasher) {
    match align {
        crate::schema::TextAlign::Left => 0_u8.hash(hasher),
        crate::schema::TextAlign::Center => 1_u8.hash(hasher),
        crate::schema::TextAlign::Right => 2_u8.hash(hasher),
    }
}

fn hash_line_cap(cap: crate::schema::IconLineCap, hasher: &mut DefaultHasher) {
    match cap {
        crate::schema::IconLineCap::Butt => 0_u8.hash(hasher),
        crate::schema::IconLineCap::Round => 1_u8.hash(hasher),
        crate::schema::IconLineCap::Square => 2_u8.hash(hasher),
    }
}

fn hash_line_join(join: crate::schema::IconLineJoin, hasher: &mut DefaultHasher) {
    match join {
        crate::schema::IconLineJoin::Bevel => 0_u8.hash(hasher),
        crate::schema::IconLineJoin::Miter => 1_u8.hash(hasher),
        crate::schema::IconLineJoin::Round => 2_u8.hash(hasher),
    }
}

fn hash_icon_primitive(primitive: &crate::schema::IconPrimitive, hasher: &mut DefaultHasher) {
    match primitive {
        crate::schema::IconPrimitive::Path(path) => {
            0_u8.hash(hasher);
            path.d.hash(hasher);
        }
        crate::schema::IconPrimitive::Circle(circle) => {
            1_u8.hash(hasher);
            circle.cx.to_bits().hash(hasher);
            circle.cy.to_bits().hash(hasher);
            circle.r.to_bits().hash(hasher);
        }
        crate::schema::IconPrimitive::Line(line) => {
            2_u8.hash(hasher);
            line.x1.to_bits().hash(hasher);
            line.y1.to_bits().hash(hasher);
            line.x2.to_bits().hash(hasher);
            line.y2.to_bits().hash(hasher);
        }
        crate::schema::IconPrimitive::Polyline(polyline) => {
            3_u8.hash(hasher);
            hash_points(&polyline.points, hasher);
        }
        crate::schema::IconPrimitive::Polygon(polygon) => {
            4_u8.hash(hasher);
            hash_points(&polygon.points, hasher);
        }
        crate::schema::IconPrimitive::Rect(rect) => {
            5_u8.hash(hasher);
            rect.x.map(f64::to_bits).hash(hasher);
            rect.y.map(f64::to_bits).hash(hasher);
            rect.width.to_bits().hash(hasher);
            rect.height.to_bits().hash(hasher);
            rect.rx.map(f64::to_bits).hash(hasher);
            rect.ry.map(f64::to_bits).hash(hasher);
        }
    }
}

fn hash_points(points: &[(f64, f64)], hasher: &mut DefaultHasher) {
    for (x, y) in points {
        x.to_bits().hash(hasher);
        y.to_bits().hash(hasher);
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
        self.render_gpu(frame, target, measurer)
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn make_framebuffers(
    device: &wgpu::Device,
    width: u32,
    height: u32,
) -> (
    wgpu::Texture,
    wgpu::TextureView,
    wgpu::Texture,
    wgpu::TextureView,
) {
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
    let msaa_texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("framebuffer_msaa"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: MSAA_SAMPLE_COUNT,
        dimension: wgpu::TextureDimension::D2,
        format: FRAMEBUFFER_FORMAT,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });
    let msaa_view = msaa_texture.create_view(&wgpu::TextureViewDescriptor::default());
    (texture, view, msaa_texture, msaa_view)
}

#[cfg(test)]
mod tests {
    use super::WgpuBackend;
    use crate::render::{CpuSkiaBackend, FrameBuffer, RenderBackend};
    use crate::schema::{IconLineCap, IconLineJoin, IconPathPrimitive, IconPrimitive, TextAlign};
    use crate::shared::types::{
        ResolvedFrame, ResolvedIcon, ResolvedNode, ResolvedNodeData, ResolvedRect, ResolvedText,
    };
    use crate::text::SkiaTextMeasurer;

    #[cfg(feature = "gpu")]
    #[test]
    fn gpu_backend_should_roughly_match_cpu_for_mixed_frame() {
        let frame = ResolvedFrame {
            background: (255, 255, 255),
            nodes: vec![
                ResolvedNode {
                    data: ResolvedNodeData::Rect(ResolvedRect {
                        width: 36.0,
                        height: 24.0,
                        fill: Some((56, 189, 248)),
                        stroke: Some((15, 23, 42)),
                        stroke_width: 2.0,
                        corner_radius: 6.0,
                    }),
                    x: 8.0,
                    y: 10.0,
                    opacity: 1.0,
                    rotation: 8.0,
                    scale_x: 1.0,
                    scale_y: 1.0,
                    skew_x: 0.0,
                    skew_y: 0.0,
                    z_index: 0,
                    source_index: 0,
                },
                ResolvedNode {
                    data: ResolvedNodeData::Text(ResolvedText {
                        text: "GPU".to_string(),
                        color: (15, 23, 42),
                        font_family: None,
                        font_size: 18.0,
                        line_height: 22.0,
                        max_width: None,
                        text_align: TextAlign::Left,
                    }),
                    x: 40.0,
                    y: 28.0,
                    opacity: 1.0,
                    rotation: 0.0,
                    scale_x: 1.0,
                    scale_y: 1.0,
                    skew_x: 0.0,
                    skew_y: 0.0,
                    z_index: 1,
                    source_index: 1,
                },
                ResolvedNode {
                    data: ResolvedNodeData::Icon(ResolvedIcon {
                        width: 28.0,
                        height: 28.0,
                        viewport_width: 24.0,
                        viewport_height: 24.0,
                        stroke: (14, 165, 233),
                        fill: None,
                        stroke_width: 2.0,
                        absolute_stroke_width: false,
                        line_cap: IconLineCap::Round,
                        line_join: IconLineJoin::Round,
                        elements: vec![
                            IconPrimitive::Path(IconPathPrimitive {
                                d: "M5 12h14".to_string(),
                            }),
                            IconPrimitive::Path(IconPathPrimitive {
                                d: "m12 5 7 7-7 7".to_string(),
                            }),
                        ],
                    }),
                    x: 54.0,
                    y: 52.0,
                    opacity: 1.0,
                    rotation: 0.0,
                    scale_x: 1.0,
                    scale_y: 1.0,
                    skew_x: 0.0,
                    skew_y: 0.0,
                    z_index: 2,
                    source_index: 2,
                },
            ],
        };

        let measurer = SkiaTextMeasurer::new();
        let mut cpu = CpuSkiaBackend::new();
        let mut gpu = WgpuBackend::new(96, 96).expect("gpu backend init");
        let mut cpu_buf = FrameBuffer::new(96, 96);
        let mut gpu_buf = FrameBuffer::new(96, 96);

        cpu.render_into(&frame, &mut cpu_buf, &measurer)
            .expect("cpu render");
        gpu.render_into(&frame, &mut gpu_buf, &measurer)
            .expect("gpu render");

        let mut total_diff: u64 = 0;
        let mut changed_pixels: u32 = 0;
        for (cpu_px, gpu_px) in cpu_buf
            .pixels()
            .chunks_exact(4)
            .zip(gpu_buf.pixels().chunks_exact(4))
        {
            let pixel_diff = cpu_px
                .iter()
                .zip(gpu_px.iter())
                .map(|(a, b)| a.abs_diff(*b) as u32)
                .sum::<u32>();
            total_diff += pixel_diff as u64;
            if pixel_diff > 48 {
                changed_pixels += 1;
            }
        }

        assert!(total_diff < 320_000, "total diff too high: {total_diff}");
        assert!(
            changed_pixels < 1_200,
            "changed pixels too high: {changed_pixels}"
        );
    }
}
