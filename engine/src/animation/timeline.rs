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

pub fn total_frame_count(desc: &VideoDescription) -> u32 {
    desc.scenes
        .iter()
        .map(|s| scene_end_frame(s) + 1)
        .max()
        .unwrap_or(0)
}

fn scene_end_frame(scene: &SceneEntry) -> u32 {
    scene.start_frame + scene.duration - 1
}
