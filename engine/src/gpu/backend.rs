use crate::render::{FrameBuffer, RenderBackend};
use crate::scene::types::{ResolvedFrame, ResolvedNode, ResolvedNodeBatchKind, ResolvedNodeData, ResolvedText};
use crate::text::TextMeasurer;

use super::atlas;
use super::geometry::{
    append_circle_geometry, append_function_graph_geometry, append_line_geometry,
    append_parametric_graph_geometry,
};
use super::path_pipeline::{self, PathBatch, PathVertex};
use super::readback::ReadbackBuffer;
use super::rect::{RectBatch, RectInstance};
use super::text_pipeline::TextBatch;
use super::util::{build_text_instances, hash_icon, hash_text_nodes, make_framebuffers};
use super::{
    CachedPathGeometry, CachedSceneBatch, Globals, PreparedFrameBatch, StaticBuffer,
    TextAtlasCache, WgpuBackend,
};

impl WgpuBackend {
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

        self.rect_instances
            .write(&self.device, &self.queue, &prepared.dynamic_rect_instances);
        self.text_instances
            .write(&self.device, &self.queue, &prepared.dynamic_text_instances);
        self.path_vertices
            .write(&self.device, &self.queue, &prepared.dynamic_path_vertices);
        self.path_indices
            .write(&self.device, &self.queue, &prepared.dynamic_path_indices);

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

            if let (Some(cache), Some(text_buffer)) = (
                self.dynamic_text_atlas_cache.as_ref(),
                self.text_instances.get(),
            ) {
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

    fn supports_frame(frame: &ResolvedFrame) -> bool {
        frame.nodes.iter().all(|node| {
            matches!(
                node.data,
                ResolvedNodeData::Circle(_)
                    | ResolvedNodeData::FunctionGraph(_)
                    | ResolvedNodeData::Icon(_)
                    | ResolvedNodeData::Line(_)
                    | ResolvedNodeData::ParametricGraph(_)
                    | ResolvedNodeData::Rect(_)
                    | ResolvedNodeData::Text(_)
            )
        })
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
            .map_or_else(Vec::new, |cache| {
                build_text_instances(cache, &dynamic_text_nodes)
            });

        let mut dynamic_path_vertices = Vec::new();
        let mut dynamic_path_indices = Vec::new();
        for node in frame
            .nodes
            .iter()
            .filter(|node| node.batch_kind == ResolvedNodeBatchKind::Dynamic)
        {
            self.append_path_geometry_for_node(
                node,
                &mut dynamic_path_vertices,
                &mut dynamic_path_indices,
            );
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
            self.append_path_geometry_for_node(
                node,
                &mut static_path_vertices,
                &mut static_path_indices,
            );
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
        icon: &crate::scene::types::ResolvedIcon,
    ) -> &CachedPathGeometry {
        let cache_key = hash_icon(icon);
        self.path_cache.entry(cache_key).or_insert_with(|| {
            let (vertices, indices) = path_pipeline::tessellate_icon(icon);
            CachedPathGeometry { vertices, indices }
        })
    }

    fn append_path_geometry_for_node(
        &mut self,
        node: &ResolvedNode,
        out_vertices: &mut Vec<PathVertex>,
        out_indices: &mut Vec<u32>,
    ) {
        match &node.data {
            ResolvedNodeData::Circle(circle) => {
                append_circle_geometry(node, circle, out_vertices, out_indices)
            }
            ResolvedNodeData::FunctionGraph(graph) => {
                append_function_graph_geometry(node, graph, out_vertices, out_indices)
            }
            ResolvedNodeData::Icon(icon) => {
                let cached = self.cached_icon_geometry(icon);
                path_pipeline::append_transformed_icon(
                    node,
                    icon,
                    &cached.vertices,
                    &cached.indices,
                    out_vertices,
                    out_indices,
                );
            }
            ResolvedNodeData::Line(line) => append_line_geometry(node, line, out_vertices, out_indices),
            ResolvedNodeData::ParametricGraph(graph) => {
                append_parametric_graph_geometry(node, graph, out_vertices, out_indices)
            }
            ResolvedNodeData::Rect(_) | ResolvedNodeData::Text(_) => {}
        }
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
        if !Self::supports_frame(frame) {
            return self.cpu_fallback.render_into(frame, target, measurer);
        }
        self.render_gpu(frame, target, measurer)
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────


