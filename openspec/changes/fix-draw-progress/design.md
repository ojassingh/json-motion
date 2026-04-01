## Context

The Rust animation engine resolves per-frame values for animatable properties by iterating over `NUMERIC_TRACK_PROPERTIES` (a fixed `[&str; 16]` array) and building a `NumTrack` for each property that has timeline events. `drawProgress` is absent from this array, so any timeline event targeting it is compiled away and never interpolated. The property exists in the TS schema, the AI catalog, and the `action: "draw"` macro output — making the current state a silent no-op at render time.

## Goals / Non-Goals

**Goals:**
- `drawProgress` resolves per-frame in the Rust engine just like any other numeric property
- No disruption to existing scenes or rendered outputs

**Non-Goals:**
- Adding new node types that use `drawProgress` (that is the scope of the graph node PR)
- Changing how the TS pipeline generates or validates `drawProgress` events

## Decisions

**Add `"drawProgress"` directly to `NUMERIC_TRACK_PROPERTIES` in `frame.rs`**

The array is the canonical source of truth for which properties get a `NumTrack`. Adding the string is the minimal, correct fix. No alternatives considered — the cause is unambiguous.

Array changes from `[&str; 16]` to `[&str; 17]`. The size literal must be updated in sync.

## Risks / Trade-offs

- **Risk**: Array size literal `[&str; 16]` becomes stale → **Mitigation**: update to `[&str; 17]` in the same commit; Rust will fail to compile if the count is wrong, so this is caught immediately
- **No behavioral risk**: properties in `NUMERIC_TRACK_PROPERTIES` that have no timeline events simply produce an empty track, which is a no-op at interpolation time
