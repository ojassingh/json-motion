mod easing;
mod segments;

pub mod frame;
pub mod timeline;

pub use frame::{compile_video, resolve_frame_fast};
pub use timeline::total_frame_count;
