use std::collections::HashMap;
use std::hash::{DefaultHasher, Hash, Hasher};

use super::path_pipeline::StrokeStyle;
use super::text_pipeline::TextInstance;
use super::{TextAtlasCache, FRAMEBUFFER_FORMAT, MSAA_SAMPLE_COUNT};
use crate::scene::types::{ResolvedNode, ResolvedText};

pub(super) fn hash_text_nodes(nodes: &[(&ResolvedNode, &ResolvedText)]) -> u64 {

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

pub(super) fn build_text_instances(
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

pub(super) fn hash_icon(icon: &crate::scene::types::ResolvedIcon) -> u64 {
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

pub(super) fn rgba(color: (u8, u8, u8), alpha: f32) -> [f32; 4] {
    let normalized_alpha = alpha.clamp(0.0, 1.0);
    [
        color.0 as f32 / 255.0 * normalized_alpha,
        color.1 as f32 / 255.0 * normalized_alpha,
        color.2 as f32 / 255.0 * normalized_alpha,
        normalized_alpha,
    ]
}

pub(super) fn muted_color((r, g, b): (u8, u8, u8), factor: f32) -> (u8, u8, u8) {
    (
        (r as f32 * factor).round() as u8,
        (g as f32 * factor).round() as u8,
        (b as f32 * factor).round() as u8,
    )
}

pub(super) fn stroke_style(
    color: (u8, u8, u8),
    width: f64,
    line_cap: lyon::tessellation::LineCap,
    join: lyon::tessellation::LineJoin,
    alpha: f32,
) -> StrokeStyle {
    StrokeStyle {
        color: rgba(color, alpha),
        join,
        line_cap,
        width: width as f32,
    }
}



pub(super) fn make_framebuffers(
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

