## 1. Rust Engine Fix

- [ ] 1.1 In `engine/src/animation/frame.rs`, add `"drawProgress"` to the `NUMERIC_TRACK_PROPERTIES` array
- [ ] 1.2 Update the array size literal from `[&str; 16]` to `[&str; 17]`
- [ ] 1.3 Run `cargo build` inside `engine/` and confirm it compiles without errors

## 2. Verification

- [ ] 2.1 Add a test scene to `engine/src/pipeline_review_tests.rs` (or benchmark) with a rect node that has a `drawProgress` timeline event animating from 0 to 1 — confirm the resolved value at mid-duration is ~0.75 with ease-out
- [ ] 2.2 Run the existing benchmark suite (`bun run scripts/benchmark-engine.ts`) and confirm no pixel-diff regressions on existing test cases
