## Why

The Rust animation engine's `NUMERIC_TRACK_PROPERTIES` constant in `frame.rs` does not include `drawProgress`, meaning timeline events that target `drawProgress` are silently ignored at render time. This property is already documented in the AI catalog, present in the TS timeline schema, and referenced by the `action: "draw"` macro — but animations using it produce no visual effect. Fixing this now unblocks the draw-reveal animation pattern for all future node types (graph curves, shapes) that depend on it.

## What Changes

- Add `"drawProgress"` to `NUMERIC_TRACK_PROPERTIES` in `engine/src/animation/frame.rs`
- The engine will now interpolate `drawProgress` per-frame just like `opacity`, `scale`, or `strokeWidth`
- No schema changes, no TS changes, no breaking changes

## Capabilities

### New Capabilities
- `draw-progress-animation`: The engine resolves and interpolates `drawProgress` as a numeric timeline property per frame

### Modified Capabilities
_(none — existing behavior is additive only)_

## Impact

- **Affected file**: `engine/src/animation/frame.rs` — single array literal change
- **No API surface change**: `drawProgress` is already in the TS timeline schema and catalog; this is purely an engine-side omission fix
- **No migration needed**: existing scenes without `drawProgress` are unaffected
