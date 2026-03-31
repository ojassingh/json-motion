use wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;

use crate::render::FrameBuffer;

/// A persistent GPU→CPU staging buffer.
///
/// `copy_texture_to_buffer` records a command to copy the current
/// framebuffer texture into this buffer (accounting for the 256-byte row
/// alignment wgpu requires).  `map_and_copy` then synchronously waits for
/// the copy to complete and writes the de-padded rows into `FrameBuffer`.
pub struct ReadbackBuffer {
    buffer: wgpu::Buffer,
    /// Aligned bytes per row (≥ width * 4, padded to COPY_BYTES_PER_ROW_ALIGNMENT).
    bytes_per_row_aligned: u32,
}

impl ReadbackBuffer {
    pub fn new(device: &wgpu::Device, width: u32, height: u32) -> Self {
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

    /// Records a copy from `texture` into this staging buffer.
    /// Must be called before `queue.submit`.
    pub fn copy_from_texture(
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

    /// Blocks until the staging buffer is mapped, then copies de-padded rows
    /// into `target.pixels`.
    pub fn map_and_copy(
        &self,
        device: &wgpu::Device,
        target: &mut FrameBuffer,
    ) -> Result<(), String> {
        let slice = self.buffer.slice(..);
        let (sender, receiver) = std::sync::mpsc::channel();
        slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = sender.send(result);
        });

        device
            .poll(wgpu::PollType::wait_indefinitely())
            .map_err(|e| format!("GPU poll error: {e}"))?;

        receiver
            .recv()
            .map_err(|e| format!("readback channel closed: {e}"))?
            .map_err(|e| format!("readback map_async failed: {e}"))?;

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

fn align_up(value: u32, alignment: u32) -> u32 {
    value.div_ceil(alignment) * alignment
}
