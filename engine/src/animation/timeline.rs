use crate::schema::{SceneEntry, TimelineEvent, VideoDescription};

pub fn get_node_events(node_id: &str, timeline: &[TimelineEvent]) -> Vec<TimelineEvent> {
    let mut out: Vec<TimelineEvent> = timeline
        .iter()
        .filter(|ev| ev.target.contains(node_id))
        .cloned()
        .map(|mut ev| {
            if ev.action.as_deref() == Some("draw") && ev.draw_progress.is_none() {
                ev.draw_progress = Some(1.0);
            }
            if let Some(s) = ev.scale {
                ev.scale_x.get_or_insert(s);
                ev.scale_y.get_or_insert(s);
            }
            ev
        })
        .collect();

    out.sort_by(|a, b| a.at.partial_cmp(&b.at).unwrap_or(std::cmp::Ordering::Equal));
    out
}

pub fn total_frame_count(desc: &VideoDescription) -> Result<u32, String> {
    desc.scenes
        .iter()
        .map(scene_end_frame_exclusive)
        .collect::<Result<Vec<_>, _>>()
        .map(|frames| frames.into_iter().max().unwrap_or(0))
}

fn scene_end_frame_exclusive(scene: &SceneEntry) -> Result<u32, String> {
    if scene.duration == 0 {
        return Err(format!("scene {} has invalid duration 0", scene.id));
    }
    scene
        .start_frame
        .checked_add(scene.duration)
        .ok_or_else(|| format!("scene {} frame range overflowed", scene.id))
}
