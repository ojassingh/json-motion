use std::collections::VecDeque;

use wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;

use crate::render::FrameBuffer;

const READBACK_RING_SIZE: usize = 3;

struct ReadbackSlot {
    buffer: wgpu::Buffer,
    /// Aligned bytes per row (>= width * 4, padded to COPY_BYTES_PER_ROW_ALIGNMENT).
    bytes_per_row_aligned: u32,
}

impl ReadbackSlot {
    fn new(device: &wgpu::Device, width: u32, height: u32) -> Self {
        let bytes_per_row_raw = width * 4;
        let bytes_per_row_aligned = align_up(bytes_per_row_raw, COPY_BYTES_PER_ROW_ALIGNMENT);
        let buffer_size = (bytes_per_row_aligned as u64) * (height as u64);

        let buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("readback"),
            size: buffer_size,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        Self {
            buffer,
            bytes_per_row_aligned,
        }
    }

    fn copy_from_texture(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        texture: &wgpu::Texture,
        width: u32,
        height: u32,
    ) {
        encoder.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo {
                texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyBufferInfo {
                buffer: &self.buffer,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(self.bytes_per_row_aligned),
                    rows_per_image: Some(height),
                },
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );
    }

    fn map_and_copy(&self, device: &wgpu::Device, target: &mut FrameBuffer) -> Result<(), String> {
        let slice = self.buffer.slice(..);
        let (sender, receiver) = std::sync::mpsc::channel();
        slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = sender.send(result);
        });

        device
            .poll(wgpu::PollType::wait_indefinitely())
            .map_err(|error| format!("GPU poll error: {error}"))?;

        receiver
            .recv()
            .map_err(|error| format!("readback channel closed: {error}"))?
            .map_err(|error| format!("readback map_async failed: {error}"))?;

        {
            let mapped = slice.get_mapped_range();
            let width = target.width() as usize;
            let height = target.height() as usize;
            let row_bytes = width * 4;
            let aligned = self.bytes_per_row_aligned as usize;
            let dst = target.pixels_mut();

            for row in 0..height {
                let src_start = row * aligned;
                let dst_start = row * row_bytes;
                dst[dst_start..dst_start + row_bytes]
                    .copy_from_slice(&mapped[src_start..src_start + row_bytes]);
            }
        }

        self.buffer.unmap();
        Ok(())
    }
}

/// A small rotating GPU->CPU staging queue that lets the renderer submit
/// multiple frames before blocking on the oldest completed readback.
pub struct ReadbackBuffer {
    available_slots: Vec<usize>,
    inflight_slots: VecDeque<usize>,
    slots: Vec<ReadbackSlot>,
}

impl ReadbackBuffer {
    pub fn new(device: &wgpu::Device, width: u32, height: u32) -> Self {
        let slots = (0..READBACK_RING_SIZE)
            .map(|_| ReadbackSlot::new(device, width, height))
            .collect::<Vec<_>>();
        let available_slots = (0..slots.len()).rev().collect();

        Self {
            available_slots,
            inflight_slots: VecDeque::new(),
            slots,
        }
    }

    pub fn can_submit(&self) -> bool {
        !self.available_slots.is_empty()
    }

    pub fn submit_copy(
        &mut self,
        encoder: &mut wgpu::CommandEncoder,
        texture: &wgpu::Texture,
        width: u32,
        height: u32,
    ) -> Result<(), String> {
        let Some(slot_index) = self.available_slots.pop() else {
            return Err("readback ring is full".to_string());
        };

        self.slots[slot_index].copy_from_texture(encoder, texture, width, height);
        self.inflight_slots.push_back(slot_index);
        Ok(())
    }

    pub fn collect_oldest(
        &mut self,
        device: &wgpu::Device,
        target: &mut FrameBuffer,
    ) -> Result<(), String> {
        let Some(slot_index) = self.inflight_slots.pop_front() else {
            return Err("no inflight GPU readback is available".to_string());
        };

        let slot = &self.slots[slot_index];
        slot.map_and_copy(device, target)?;
        self.available_slots.push(slot_index);
        Ok(())
    }
}

fn align_up(value: u32, alignment: u32) -> u32 {
    value.div_ceil(alignment) * alignment
}
