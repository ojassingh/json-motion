mod atlas;
mod path_pipeline;
mod readback;
mod rect;
mod text_pipeline;

use std::collections::HashMap;
use std::env;
use std::hash::{DefaultHasher, Hash, Hasher};

use bytemuck::{Pod, Zeroable};
use wgpu::util::DeviceExt;

use crate::render::{FrameBuffer, RenderBackend};
use crate::shared::types::{
    ResolvedFrame, ResolvedNode, ResolvedNodeBatchKind, ResolvedNodeData, ResolvedText,
};
use crate::text::TextMeasurer;

use path_pipeline::{PathBatch, PathPipeline, PathVertex};
use readback::ReadbackBuffer;
use rect::{RectBatch, RectInstance, RectPipeline};
use text_pipeline::{TextBatch, TextInstance, TextPipeline};

/// RGBA8 linear — same channel order as ffmpeg's `Pixel::RGBA`.
const FRAMEBUFFER_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
const MSAA_SAMPLE_COUNT: u32 = 4;
const NVIDIA_VENDOR_ID: u32 = 0x10DE;
const ENV_ENGINE_REQUIRE_NVIDIA_VULKAN: &str = "ENGINE_REQUIRE_NVIDIA_VULKAN";

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
    key: u64,
    _texture: wgpu::Texture,
    width: u32,
    height: u32,
}

struct CachedPathGeometry {
    indices: Vec<u32>,
    vertices: Vec<PathVertex>,
}

struct StaticBuffer<T> {
    buffer: wgpu::Buffer,
    len: usize,
    _marker: std::marker::PhantomData<T>,
}

impl<T: Pod> StaticBuffer<T> {
    fn new(device: &wgpu::Device, label: &'static str, usage: wgpu::BufferUsages, data: &[T]) -> Self {
        Self {
            buffer: device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some(label),
                contents: bytemuck::cast_slice(data),
                usage,
            }),
            len: data.len(),
            _marker: std::marker::PhantomData,
        }
    }
}

struct CachedSceneBatch {
    path_indices: Option<StaticBuffer<u32>>,
    path_vertices: Option<StaticBuffer<PathVertex>>,
    rect_instances: Option<StaticBuffer<RectInstance>>,
    text_atlas: Option<TextAtlasCache>,
    text_instances: Option<StaticBuffer<TextInstance>>,
}

struct PreparedFrameBatch {
    dynamic_path_indices: Vec<u32>,
    dynamic_path_vertices: Vec<PathVertex>,
    dynamic_rect_instances: Vec<RectInstance>,
    scene_cache_key: Option<u64>,
    dynamic_text_instances: Vec<TextInstance>,
}

fn env_var_is_truthy(name: &str) -> bool {
    env::var(name).is_ok_and(|value| {
        let normalized = value.trim().to_ascii_lowercase();
        !normalized.is_empty() && normalized != "0" && normalized != "false" && normalized != "no"
    })
}

fn default_backends() -> wgpu::Backends {
    if cfg!(target_os = "linux") {
        wgpu::Backends::VULKAN
    } else {
        wgpu::Backends::PRIMARY
    }
}

fn format_adapter_info(info: &wgpu::AdapterInfo) -> String {
    format!(
        "name={:?}, backend={:?}, vendor=0x{:04x}, device=0x{:04x}, type={:?}, driver={:?}, driver_info={:?}, pci_bus={:?}",
        info.name,
        info.backend,
        info.vendor,
        info.device,
        info.device_type,
        info.driver,
        info.driver_info,
        info.device_pci_bus_id
    )
}

async fn request_default_adapter(instance: &wgpu::Instance) -> Result<wgpu::Adapter, String> {
    instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: None,
            force_fallback_adapter: false,
        })
        .await
        .map_err(|error| format!("no suitable GPU adapter found: {error}"))
}

async fn request_nvidia_vulkan_adapter(instance: &wgpu::Instance) -> Result<wgpu::Adapter, String> {
    let adapters = instance.enumerate_adapters(wgpu::Backends::VULKAN).await;
    let mut visible_adapters = Vec::with_capacity(adapters.len());

    for adapter in adapters {
        let info = adapter.get_info();
        visible_adapters.push(format_adapter_info(&info));
        if info.backend == wgpu::Backend::Vulkan && info.vendor == NVIDIA_VENDOR_ID {
            return Ok(adapter);
        }
    }

    Err(format!(
        "no NVIDIA Vulkan adapter available; visible adapters: {}",
        visible_adapters.join(", ")
    ))
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
    dynamic_text_atlas_cache: Option<TextAtlasCache>,
    path_cache: HashMap<u64, CachedPathGeometry>,
    scene_batches: HashMap<u64, CachedSceneBatch>,
}

impl WgpuBackend {
    /// Initialise a wgpu device and all GPU resources for the given canvas size.
    /// Returns `Err` if no suitable GPU adapter is found.
    pub fn new(width: u32, height: u32) -> Result<Self, String> {
        let require_nvidia_vulkan =
            cfg!(target_os = "linux") && env_var_is_truthy(ENV_ENGINE_REQUIRE_NVIDIA_VULKAN);
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: default_backends(),
            flags: wgpu::InstanceFlags::default(),
            memory_budget_thresholds: Default::default(),
            backend_options: Default::default(),
            display: None,
        });
        let adapter = if require_nvidia_vulkan {
            pollster::block_on(request_nvidia_vulkan_adapter(&instance))?
        } else {
            pollster::block_on(request_default_adapter(&instance))?
        };
        let adapter_info = adapter.get_info();
        eprintln!("wgpu adapter: {}", format_adapter_info(&adapter_info));
        if require_nvidia_vulkan
            && (adapter_info.backend != wgpu::Backend::Vulkan
                || adapter_info.vendor != NVIDIA_VENDOR_ID)
        {
            return Err(format!(
                "selected GPU adapter does not satisfy the required NVIDIA Vulkan lane: {}",
                format_adapter_info(&adapter_info)
            ));
        }

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
            dynamic_text_atlas_cache: None,
            path_cache: HashMap::new(),
            scene_batches: HashMap::new(),
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
        self.dynamic_text_atlas_cache = None;
        self.scene_batches.clear();

        let globals_data = Globals {
            canvas_size: [width as f32, height as f32],
            _pad: [0.0; 2],
        };
        self.queue
            .write_buffer(&self.globals_buf, 0, bytemuck::bytes_of(&globals_data));

        self.fb_width = width;
        self.fb_height = height;
    }

    pub fn can_accept_frame(&self) -> bool {
        self.readback.can_submit()
    }

    pub fn submit_frame(
        &mut self,
        frame: &ResolvedFrame,
        measurer: &dyn TextMeasurer,
    ) -> Result<(), String> {
        let prepared = self.prepare_frame_batch(frame, measurer)?;
        let (bg_r, bg_g, bg_b) = frame.background;
        let bg_color = wgpu::Color {
            r: bg_r as f64 / 255.0,
            g: bg_g as f64 / 255.0,
            b: bg_b as f64 / 255.0,
            a: 1.0,
        };

        self.rect_instances.write(
            &self.device,
            &self.queue,
            &prepared.dynamic_rect_instances,
        );
        self.text_instances.write(
            &self.device,
            &self.queue,
            &prepared.dynamic_text_instances,
        );
        self.path_vertices.write(
            &self.device,
            &self.queue,
            &prepared.dynamic_path_vertices,
        );
        self.path_indices.write(
            &self.device,
            &self.queue,
            &prepared.dynamic_path_indices,
        );

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

            if let Some(scene_cache_key) = prepared.scene_cache_key {
                if let Some(static_batch) = self.scene_batches.get(&scene_cache_key) {
                    if let Some(rect_instances) = static_batch.rect_instances.as_ref() {
                        RectBatch::draw(
                            &self.rect_pipeline,
                            &mut pass,
                            &rect_instances.buffer,
                            rect_instances.len,
                        );
                    }

                    if let (Some(text_atlas), Some(text_instances)) = (
                        static_batch.text_atlas.as_ref(),
                        static_batch.text_instances.as_ref(),
                    ) {
                        TextBatch::draw(
                            &self.text_pipeline,
                            &mut pass,
                            &text_atlas.bind_group,
                            &text_instances.buffer,
                            text_instances.len,
                        );
                    }

                    if let (Some(path_vertices), Some(path_indices)) = (
                        static_batch.path_vertices.as_ref(),
                        static_batch.path_indices.as_ref(),
                    ) {
                        PathBatch::draw(
                            &self.path_pipeline,
                            &mut pass,
                            &path_vertices.buffer,
                            &path_indices.buffer,
                            path_vertices.len,
                            path_indices.len,
                        );
                    }
                }
            }

            if let Some(rect_buffer) = self.rect_instances.get() {
                RectBatch::draw(
                    &self.rect_pipeline,
                    &mut pass,
                    rect_buffer,
                    prepared.dynamic_rect_instances.len(),
                );
            }

            if let (Some(cache), Some(text_buffer)) =
                (self.dynamic_text_atlas_cache.as_ref(), self.text_instances.get())
            {
                TextBatch::draw(
                    &self.text_pipeline,
                    &mut pass,
                    &cache.bind_group,
                    text_buffer,
                    prepared.dynamic_text_instances.len(),
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
                    prepared.dynamic_path_vertices.len(),
                    prepared.dynamic_path_indices.len(),
                );
            }
        }

        self.readback.submit_copy(
            &mut encoder,
            &self.framebuffer,
            self.fb_width,
            self.fb_height,
        )?;
        self.queue.submit(std::iter::once(encoder.finish()));
        Ok(())
    }

    pub fn collect_frame(&mut self, target: &mut FrameBuffer) -> Result<(), String> {
        self.readback.collect_oldest(&self.device, target)
    }

    fn render_gpu(
        &mut self,
        frame: &ResolvedFrame,
        target: &mut FrameBuffer,
        measurer: &dyn TextMeasurer,
    ) -> Result<(), String> {
        self.submit_frame(frame, measurer)?;
        self.collect_frame(target)
    }

    fn prepare_frame_batch(
        &mut self,
        frame: &ResolvedFrame,
        measurer: &dyn TextMeasurer,
    ) -> Result<PreparedFrameBatch, String> {
        if frame.scene_cache_key != 0 {
            self.build_scene_batch_if_missing(frame, measurer)?;
        }

        let dynamic_rect_instances = frame
            .nodes
            .iter()
            .filter(|node| node.batch_kind == ResolvedNodeBatchKind::Dynamic)
            .filter_map(|node| {
                if let ResolvedNodeData::Rect(rect) = &node.data {
                    Some(RectInstance::from_node(node, rect))
                } else {
                    None
                }
            })
            .collect();

        let dynamic_text_nodes = frame
            .nodes
            .iter()
            .filter(|node| node.batch_kind == ResolvedNodeBatchKind::Dynamic)
            .filter_map(|node| {
                if let ResolvedNodeData::Text(text) = &node.data {
                    Some((node, text))
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();
        self.prepare_dynamic_text_atlas(&dynamic_text_nodes, measurer);
        let dynamic_text_instances = self
            .dynamic_text_atlas_cache
            .as_ref()
            .map_or_else(Vec::new, |cache| build_text_instances(cache, &dynamic_text_nodes));

        let mut dynamic_path_vertices = Vec::new();
        let mut dynamic_path_indices = Vec::new();
        for node in frame
            .nodes
            .iter()
            .filter(|node| node.batch_kind == ResolvedNodeBatchKind::Dynamic)
        {
            if let ResolvedNodeData::Icon(icon) = &node.data {
                let cached = self.cached_icon_geometry(icon);
                path_pipeline::append_transformed_icon(
                    node,
                    icon,
                    &cached.vertices,
                    &cached.indices,
                    &mut dynamic_path_vertices,
                    &mut dynamic_path_indices,
                );
            }
        }

        Ok(PreparedFrameBatch {
            dynamic_path_indices,
            dynamic_path_vertices,
            dynamic_rect_instances,
            scene_cache_key: (frame.scene_cache_key != 0).then_some(frame.scene_cache_key),
            dynamic_text_instances,
        })
    }

    fn build_scene_batch_if_missing(
        &mut self,
        frame: &ResolvedFrame,
        measurer: &dyn TextMeasurer,
    ) -> Result<(), String> {
        if self.scene_batches.contains_key(&frame.scene_cache_key) {
            return Ok(());
        }

        let static_rect_instances = frame
            .nodes
            .iter()
            .filter(|node| node.batch_kind == ResolvedNodeBatchKind::Static)
            .filter_map(|node| {
                if let ResolvedNodeData::Rect(rect) = &node.data {
                    Some(RectInstance::from_node(node, rect))
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();

        let static_text_nodes = frame
            .nodes
            .iter()
            .filter(|node| node.batch_kind == ResolvedNodeBatchKind::Static)
            .filter_map(|node| {
                if let ResolvedNodeData::Text(text) = &node.data {
                    Some((node, text))
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();
        let static_text_atlas = self.build_text_atlas_cache(
            &static_text_nodes,
            measurer,
            hash_text_nodes(&static_text_nodes),
        );
        let static_text_instances = static_text_atlas.as_ref().map(|cache| {
            let instances = build_text_instances(cache, &static_text_nodes);
            StaticBuffer::new(
                &self.device,
                "static_text_instances",
                wgpu::BufferUsages::VERTEX,
                &instances,
            )
        });

        let mut static_path_vertices = Vec::new();
        let mut static_path_indices = Vec::new();
        for node in frame
            .nodes
            .iter()
            .filter(|node| node.batch_kind == ResolvedNodeBatchKind::Static)
        {
            if let ResolvedNodeData::Icon(icon) = &node.data {
                let cached = self.cached_icon_geometry(icon);
                path_pipeline::append_transformed_icon(
                    node,
                    icon,
                    &cached.vertices,
                    &cached.indices,
                    &mut static_path_vertices,
                    &mut static_path_indices,
                );
            }
        }

        let batch = CachedSceneBatch {
            path_indices: (!static_path_indices.is_empty()).then(|| {
                StaticBuffer::new(
                    &self.device,
                    "static_path_indices",
                    wgpu::BufferUsages::INDEX,
                    &static_path_indices,
                )
            }),
            path_vertices: (!static_path_vertices.is_empty()).then(|| {
                StaticBuffer::new(
                    &self.device,
                    "static_path_vertices",
                    wgpu::BufferUsages::VERTEX,
                    &static_path_vertices,
                )
            }),
            rect_instances: (!static_rect_instances.is_empty()).then(|| {
                StaticBuffer::new(
                    &self.device,
                    "static_rect_instances",
                    wgpu::BufferUsages::VERTEX,
                    &static_rect_instances,
                )
            }),
            text_atlas: static_text_atlas,
            text_instances: static_text_instances,
        };
        self.scene_batches.insert(frame.scene_cache_key, batch);
        Ok(())
    }

    fn prepare_dynamic_text_atlas(
        &mut self,
        text_nodes: &[(&ResolvedNode, &ResolvedText)],
        measurer: &dyn TextMeasurer,
    ) {
        if text_nodes.is_empty() {
            self.dynamic_text_atlas_cache = None;
            return;
        }

        let atlas_key = hash_text_nodes(text_nodes);
        let should_rebuild = self
            .dynamic_text_atlas_cache
            .as_ref()
            .is_none_or(|cache| cache.key != atlas_key);

        if should_rebuild {
            self.dynamic_text_atlas_cache =
                self.build_text_atlas_cache(text_nodes, measurer, atlas_key);
        }
    }

    fn build_text_atlas_cache(
        &self,
        text_nodes: &[(&ResolvedNode, &ResolvedText)],
        measurer: &dyn TextMeasurer,
        atlas_key: u64,
    ) -> Option<TextAtlasCache> {
        atlas::build_text_atlas(text_nodes, measurer).map(|atlas_build| {
            let texture = self.device.create_texture(&wgpu::TextureDescriptor {
                label: Some("glyph_atlas"),
                size: wgpu::Extent3d {
                    width: atlas_build.width,
                    height: atlas_build.height,
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
                &atlas_build.pixels,
                wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(atlas_build.width),
                    rows_per_image: Some(atlas_build.height),
                },
                wgpu::Extent3d {
                    width: atlas_build.width,
                    height: atlas_build.height,
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
                entries: atlas_build.entries,
                key: atlas_key,
                _texture: texture,
                width: atlas_build.width,
                height: atlas_build.height,
            }
        })
    }

    fn cached_icon_geometry(
        &mut self,
        icon: &crate::shared::types::ResolvedIcon,
    ) -> &CachedPathGeometry {
        let cache_key = hash_icon(icon);
        self.path_cache.entry(cache_key).or_insert_with(|| {
            let (vertices, indices) = path_pipeline::tessellate_icon(icon);
            CachedPathGeometry { vertices, indices }
        })
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

fn build_text_instances(
    cache: &TextAtlasCache,
    text_nodes: &[(&ResolvedNode, &ResolvedText)],
) -> Vec<TextInstance> {
    let text_node_lookup: HashMap<usize, &ResolvedNode> = text_nodes
        .iter()
        .map(|(node, _)| (node.source_index, *node))
        .collect();
    let mut text_instances = Vec::new();
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

    text_instances
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
        ResolvedFrame, ResolvedIcon, ResolvedNode, ResolvedNodeBatchKind, ResolvedNodeData,
        ResolvedRect, ResolvedText,
    };
    use crate::text::SkiaTextMeasurer;

    #[cfg(feature = "gpu")]
    #[test]
    fn gpu_backend_should_roughly_match_cpu_for_mixed_frame() {
        let frame = ResolvedFrame {
            background: (255, 255, 255),
            nodes: vec![
                ResolvedNode {
                    batch_kind: ResolvedNodeBatchKind::Dynamic,
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
                    batch_kind: ResolvedNodeBatchKind::Dynamic,
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
                    batch_kind: ResolvedNodeBatchKind::Dynamic,
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
            scene_cache_key: 0,
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
