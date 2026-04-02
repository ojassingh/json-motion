# draw-progress-animation Specification

## Purpose
TBD - created by archiving change fix-draw-progress. Update Purpose after archive.
## Requirements
### Requirement: The animation resolver interpolates drawProgress as a numeric track property
The Rust engine SHALL include `"drawProgress"` in its `NUMERIC_TRACK_PROPERTIES` list so that timeline events targeting `drawProgress` are compiled into a `NumTrack` and interpolated per frame using the configured easing, identical to how `opacity`, `scale`, and `strokeWidth` are resolved.

#### Scenario: A timeline event animating drawProgress from 0 to 1 resolves correctly at mid-frame
- **WHEN** a node has a timeline event `{ at: 0.0, dur: 1.0, drawProgress: 1.0 }` and the current frame corresponds to 0.5s into that event with `ease-out` easing
- **THEN** the resolved `drawProgress` value is approximately 0.75 (ease-out at alpha=0.5), not 0 or 1

#### Scenario: A scene with no drawProgress timeline events is unaffected
- **WHEN** a scene contains only rect and text nodes with opacity and position animations, none of which use drawProgress
- **THEN** the rendered output is pixel-identical to the output before this fix

