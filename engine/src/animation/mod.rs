mod easing;
mod segments;

pub mod frame;
pub mod timeline;

pub use frame::{PrecomputedScene, resolve_frame_fast};
pub use timeline::total_frame_count;
