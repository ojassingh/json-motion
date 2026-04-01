mod cpu;
mod transform;

pub use cpu::CpuSkiaBackend;
pub(crate) use transform::{apply_node_transform, make_paint};

use crate::scene::types::ResolvedFrame;
use crate::text::TextMeasurer;

pub struct FrameBuffer {
    pixels: Vec<u8>,
    height: u32,
    width: u32,
}

pub trait RenderBackend {
    fn render_into(
        &mut self,
        frame: &ResolvedFrame,
        target: &mut FrameBuffer,
        measurer: &dyn TextMeasurer,
    ) -> Result<(), String>;
}

impl FrameBuffer {
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            pixels: vec![0_u8; width as usize * height as usize * 4],
            height,
            width,
        }
    }

    pub fn pixels(&self) -> &[u8] {
        &self.pixels
    }

    pub fn pixels_mut(&mut self) -> &mut [u8] {
        &mut self.pixels
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }
}

