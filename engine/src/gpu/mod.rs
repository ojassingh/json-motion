mod atlas;
mod backend;
mod geometry;
mod path_pipeline;
mod readback;
mod rect;
mod text_pipeline;
mod util;

use std::collections::HashMap;
use std::env;
use bytemuck::{Pod, Zeroable};
use wgpu::util::DeviceExt;

use crate::render::CpuSkiaBackend;

use path_pipeline::{PathPipeline, PathVertex};
use readback::ReadbackBuffer;
use rect::{RectInstance, RectPipeline};
use text_pipeline::{TextInstance, TextPipeline};
use util::make_framebuffers;

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
    fn new(
        device: &wgpu::Device,
        label: &'static str,
        usage: wgpu::BufferUsages,
        data: &[T],
    ) -> Self {
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
/// Frames containing unsupported primitives fall back to `CpuSkiaBackend`
/// so correctness is preserved while GPU coverage grows incrementally.
pub struct WgpuBackend {
    cpu_fallback: CpuSkiaBackend,
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
            cpu_fallback: CpuSkiaBackend::new(),
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
}

#[cfg(test)]
mod tests {
    use super::WgpuBackend;
    use crate::render::{CpuSkiaBackend, FrameBuffer, RenderBackend};
    use crate::schema::{
        IconLineCap, IconLineJoin, IconPathPrimitive, IconPrimitive, LineCap, LineHead, TextAlign,
    };
    use crate::scene::types::{
        ResolvedCircle, ResolvedFrame, ResolvedFunctionGraph, ResolvedIcon,
        ResolvedLine, ResolvedNode, ResolvedNodeBatchKind, ResolvedNodeData,
        ResolvedParametricGraph, ResolvedRect, ResolvedText,
    };
    use crate::text::SkiaTextMeasurer;

    fn pixel_diff_metrics(cpu_buf: &FrameBuffer, gpu_buf: &FrameBuffer) -> (u64, u32) {
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

        (total_diff, changed_pixels)
    }

    fn count_non_background_pixels(buffer: &FrameBuffer, background: (u8, u8, u8)) -> usize {
        buffer
            .pixels()
            .chunks_exact(4)
            .filter(|pixel| pixel[0] != background.0 || pixel[1] != background.1 || pixel[2] != background.2)
            .count()
    }

    fn direct_gpu_render(
        frame: &ResolvedFrame,
        width: u32,
        height: u32,
        measurer: &SkiaTextMeasurer,
    ) -> FrameBuffer {
        let mut gpu = WgpuBackend::new(width, height).expect("gpu backend init");
        let mut gpu_buf = FrameBuffer::new(width, height);
        gpu.submit_frame(frame, measurer).expect("submit frame");
        gpu.collect_frame(&mut gpu_buf).expect("collect frame");
        gpu_buf
    }

    fn vector_frame() -> ResolvedFrame {
        ResolvedFrame {
            background: (255, 255, 255),
            nodes: vec![
                ResolvedNode {
                    batch_kind: ResolvedNodeBatchKind::Dynamic,
                    data: ResolvedNodeData::Circle(ResolvedCircle {
                        radius: 16.0,
                        fill: Some((56, 189, 248)),
                        stroke: Some((15, 23, 42)),
                        stroke_width: 2.0,
                        draw_progress: 0.75,
                    }),
                    x: 8.0,
                    y: 8.0,
                    opacity: 1.0,
                    rotation: 0.0,
                    scale_x: 1.0,
                    scale_y: 1.0,
                    skew_x: 0.0,
                    skew_y: 0.0,
                    z_index: 0,
                    source_index: 0,
                },
                ResolvedNode {
                    batch_kind: ResolvedNodeBatchKind::Dynamic,
                    data: ResolvedNodeData::Line(ResolvedLine {
                        x1: 0.0,
                        y1: 12.0,
                        x2: 38.0,
                        y2: 12.0,
                        stroke: (34, 197, 94),
                        stroke_width: 3.0,
                        cap: LineCap::Round,
                        draw_progress: 1.0,
                        head: LineHead::End,
                        head_size: 10.0,
                    }),
                    x: 8.0,
                    y: 52.0,
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
                    data: ResolvedNodeData::Line(ResolvedLine {
                        x1: 0.0,
                        y1: 0.0,
                        x2: 42.0,
                        y2: 20.0,
                        stroke: (249, 115, 22),
                        stroke_width: 3.0,
                        cap: LineCap::Round,
                        draw_progress: 1.0,
                        head: LineHead::None,
                        head_size: 10.0,
                    }),
                    x: 12.0,
                    y: 94.0,
                    opacity: 1.0,
                    rotation: 0.0,
                    scale_x: 1.0,
                    scale_y: 1.0,
                    skew_x: 0.0,
                    skew_y: 0.0,
                    z_index: 2,
                    source_index: 2,
                },
                ResolvedNode {
                    batch_kind: ResolvedNodeBatchKind::Dynamic,
                    data: ResolvedNodeData::FunctionGraph(ResolvedFunctionGraph {
                        width: 56.0,
                        height: 40.0,
                        points: vec![
                            (0.0, 30.0),
                            (14.0, 20.0),
                            (28.0, 10.0),
                            (42.0, 20.0),
                            (56.0, 30.0),
                        ],
                        color: (14, 165, 233),
                        stroke_width: 2.0,
                        show_axes: true,
                        show_grid: true,
                        draw_progress: 1.0,
                        x_range: Some([-1.0, 1.0]),
                        y_range: Some([-1.0, 1.0]),
                    }),
                    x: 64.0,
                    y: 8.0,
                    opacity: 1.0,
                    rotation: 0.0,
                    scale_x: 1.0,
                    scale_y: 1.0,
                    skew_x: 0.0,
                    skew_y: 0.0,
                    z_index: 3,
                    source_index: 3,
                },
                ResolvedNode {
                    batch_kind: ResolvedNodeBatchKind::Dynamic,
                    data: ResolvedNodeData::ParametricGraph(ResolvedParametricGraph {
                        width: 44.0,
                        height: 44.0,
                        points: vec![
                            (22.0, 0.0),
                            (35.0, 10.0),
                            (44.0, 22.0),
                            (35.0, 34.0),
                            (22.0, 44.0),
                            (9.0, 34.0),
                            (0.0, 22.0),
                            (9.0, 10.0),
                            (22.0, 0.0),
                        ],
                        color: (244, 114, 182),
                        stroke_width: 2.0,
                        draw_progress: 1.0,
                    }),
                    x: 74.0,
                    y: 72.0,
                    opacity: 1.0,
                    rotation: 0.0,
                    scale_x: 1.0,
                    scale_y: 1.0,
                    skew_x: 0.0,
                    skew_y: 0.0,
                    z_index: 4,
                    source_index: 4,
                },
            ],
            scene_cache_key: 0,
        }
    }

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

        let (total_diff, changed_pixels) = pixel_diff_metrics(&cpu_buf, &gpu_buf);

        assert!(total_diff < 320_000, "total diff too high: {total_diff}");
        assert!(
            changed_pixels < 1_200,
            "changed pixels too high: {changed_pixels}"
        );
    }

    #[cfg(feature = "gpu")]
    #[test]
    fn gpu_backend_submit_frame_should_render_vector_primitives() {
        let frame = vector_frame();
        let measurer = SkiaTextMeasurer::new();
        let mut cpu = CpuSkiaBackend::new();
        let mut cpu_buf = FrameBuffer::new(128, 128);

        cpu.render_into(&frame, &mut cpu_buf, &measurer)
            .expect("cpu render");
        let gpu_buf = direct_gpu_render(&frame, 128, 128, &measurer);

        let (total_diff, changed_pixels) = pixel_diff_metrics(&cpu_buf, &gpu_buf);
        let non_background = count_non_background_pixels(&gpu_buf, frame.background);

        assert!(
            non_background > 1_000,
            "expected GPU vector render to paint visible content, saw {non_background} non-background pixels"
        );
        assert!(total_diff < 1_500_000, "total diff too high: {total_diff}");
        assert!(
            changed_pixels < 5_000,
            "changed pixels too high: {changed_pixels}"
        );
    }
}
