- [x] Fix explicit GPU backend requests so they fail closed instead of silently falling back to CPU.
- [x] Change parallel chunk merging to remux with stream copy instead of re-encoding chunk outputs.
- [x] Replace summed worker timings with wall-clock timing buckets for parallel export and include merge time.
- [x] Re-run engine verification and targeted runtime smoke checks.

---

## Parallel Export Findings Fix

### Review

- Explicit `--backend=gpu` requests now fail closed if the binary was built without the `gpu` feature or if GPU backend initialization fails; only auto-selection is allowed to fall back to CPU.
- Parallel export now writes intermediate chunk files as `.mkv` and concatenates them with `ffmpeg -c copy`, so the final merge remuxes the chunk outputs instead of running a second full encode pass.
- Parallel mode now reports wall-clock timing buckets instead of summed worker timings: `render` covers the parallel chunk-processing window and `encode` covers the final concat/remux step, which keeps the existing API shape while making the total truthful again.
- Improved concat failure reporting so FFmpeg stderr is surfaced on merge failures instead of returning only an exit code.
- Cleared the outstanding Clippy warnings in the touched engine code by replacing manual ceil division and collapsing the oversized argument lists into small request structs.

### Verification

- `cargo test --release --features gpu` in `engine/`
- `cargo clippy --release --features gpu --all-targets -- -D warnings` in `engine/`
- `cargo build --release --features gpu` in `engine/`
- `cargo run --release -- <input> <output>.mp4 libx264 --backend=gpu` in `engine/`
  - verified explicit GPU requests now fail closed without the feature: `GPU backend requested explicitly but engine was built without the 'gpu' feature`
- Direct engine smoke run with `--backend=cpu --parallel-workers=3`
  - verified the parallel path completes successfully after the no-reencode concat change and emits the expected timing line
- `BENCH_ITERATIONS=1 BENCH_PARALLEL_WORKERS=3 bun run bench:engine`
  - completed the short and medium cases (`rect-stress`, `text-heavy`, `icon-dense`, `math-complex`, `mixed-dense`) without parallel concat failures; the long-form case was still running when this review note was written

### Notes

- The benchmark harness still reports one existing image-quality failure on `rect-stress` GPU pixel diff; that predates these three fixes and was not part of this patch.

- [x] Inspect GPU backend hotspots for atlas rebuilds, tessellation churn, and per-frame buffer allocation.
- [x] Capture a fresh benchmark baseline for the GPU engine cases.
- [x] Add minimal cross-frame caches for text atlas results and icon/math tessellation.
- [x] Reuse grow-only GPU buffers for rect, text, and path draws instead of recreating them every frame.
- [x] Run targeted verification plus before/after benchmarks and document the result.

---

## GPU Cache Pass

### Review

- Added a single-entry text atlas cache in `WgpuBackend` keyed by raster-affecting text inputs, while storing line placement in local text space so moving or rotating text can still reuse the same atlas across frames.
- Added a simple icon/path tessellation cache keyed by icon geometry/style, then applied transform and opacity per frame from cached local-space vertices instead of reparsing and retessellating every icon every frame.
- Replaced per-frame rect/text/path GPU upload buffer creation with grow-only reusable buffers that persist on the backend and are rewritten via `queue.write_buffer`.

### Verification

- `cargo test --release --features gpu gpu_backend_should_roughly_match_cpu_for_mixed_frame -- --nocapture` in `engine/`
- `cargo build --release --features gpu` in `engine/`
- `BENCH_ITERATIONS=1 bun run bench:engine`

### Benchmarks

- GPU render time, before -> after:
- `rect-stress`: `227.46ms` -> `226.38ms` (`-0.5%`)
- `text-heavy`: `489.71ms` -> `206.50ms` (`-57.8%`)
- `icon-dense`: `236.47ms` -> `202.71ms` (`-14.3%`)
- `math-complex`: `2965.15ms` -> `315.51ms` (`-89.4%`)
- `mixed-dense`: `1005.34ms` -> `858.21ms` (`-14.6%`)
- `long-form`: `22112.19ms` -> `16810.92ms` (`-24.0%`)

---

## GPU Quality Pass

### Review

- Added a minimal 4x MSAA render target for the GPU backend, then resolve into the existing single-sample framebuffer for readback/encoding.
- Updated the rect, text, and path pipelines to use the same sample count so icon and math edges get hardware multisample smoothing without changing the existing caching or tessellation design.

### Verification

- `cargo build --release --features gpu` in `engine/`
- `cargo test --release --features gpu gpu_backend_should_roughly_match_cpu_for_mixed_frame -- --nocapture` in `engine/`
- `BENCH_ITERATIONS=1 bun run bench:engine`

### Benchmarks

- GPU render time after MSAA vs pre-MSAA cached backend:
- `rect-stress`: `226.38ms` -> `225.24ms` (`-0.5%`)
- `text-heavy`: `206.50ms` -> `203.65ms` (`-1.4%`)
- `icon-dense`: `202.71ms` -> `214.25ms` (`+5.7%`)
- `math-complex`: `315.51ms` -> `325.06ms` (`+3.0%`)
- `mixed-dense`: `858.21ms` -> `898.22ms` (`+4.7%`)
- `long-form`: `16810.92ms` -> `19609.35ms` (`+16.7%`)

- Quality signal improved for the path-heavy cases:
- `icon-dense` pixel diff: `avgChannelDiff 1.5716 -> 0.6164`, `changedPixelRatio 0.0323 -> 0.0047`
- `math-complex` pixel diff: `avgChannelDiff 3.0783 -> 1.2664`, `changedPixelRatio 0.0682 -> 0.0230`

---

- [x] Inspect the AI generation endpoint and schema conversion path.
- [x] Inspect the render endpoint, frame renderer, and encoder pipeline.
- [x] Identify which stages are CPU-bound, GPU-assisted, or codec/hardware dependent.
- [x] Explain the post-JSON flow in plain language for a non-graphics audience.

---

## Engine Runtime Performance Layer

- [x] Compile scene timelines into reusable property tracks and frame indexes.
- [x] Reuse static layout results when scene timelines do not affect layout-critical properties.
- [x] Introduce a small render backend boundary plus reusable frame buffers for encoding.
- [x] Add benchmark coverage for simple motion, dense rects, dense animation, dense text, and dense icon fixtures.
- [x] Run before/after verification, capture benchmark results, and document review notes.

### Review

- Added a minimal runtime compile step in the Rust engine so property tracks are built once per scene instead of per node-property lookup on every frame.
- Added a small `TextMeasurer` boundary plus static-layout reuse for scenes whose timelines do not touch layout-critical properties.
- Replaced per-frame output allocation with a reusable `FrameBuffer` path and a tiny `RenderBackend` seam that still keeps the current CPU Skia renderer as the only backend.
- Added an end-to-end benchmark harness at `scripts/benchmark-engine.ts` with five fixtures: simple motion, 2,000 rects, 400 animated rects, 200 stacked text nodes, and 300 icons.

### Verification

- `cargo test` in `engine/`
- `cargo clippy --all-targets --locked -- -D warnings` in `engine/`
- `cargo build --release` in `engine/`
- `bun x tsc --noEmit`
- `BENCH_ITERATIONS=3 bun run bench:engine`

### Benchmarks

- Environment: macOS hardware encode via `h264_videotoolbox`, averaged across 3 runs per fixture.
- Baseline commit: `3dec23f`
- Current branch: `codex/runtime-eval-backend` after the runtime refactor and benchmark harness.

| Case | Before Render | After Render | Delta | Before Wall | After Wall | Delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `simple_motion` | 140.04ms | 134.88ms | -3.7% | 925.54ms | 735.22ms | -20.6% |
| `dense_rect_grid_2000` | 468.22ms | 339.98ms | -27.4% | 937.73ms | 806.03ms | -14.0% |
| `animated_rect_grid_400` | 685.05ms | 661.31ms | -3.5% | 1781.73ms | 1738.47ms | -2.4% |
| `layout_text_stack_200` | 190.40ms | 119.48ms | -37.2% | 705.84ms | 590.90ms | -16.3% |
| `icon_grid_300` | 283.32ms | 231.76ms | -18.2% | 791.09ms | 692.73ms | -12.4% |

- The keyframe-heavy animated grid improved only modestly. That is useful signal: the current refactor removes repeated segment construction and some allocation churn, but it does not yet add the broader evaluator caching or parallelism that will be needed for larger animation-heavy wins.

---

## Preview Panel Raw Output + Timing UI

- [x] Inspect the shared preview panel data flow for home and playground.
- [x] Add raw AI output and timing metadata to the prompt-to-video pipeline responses.
- [x] Update the preview JSON panel to toggle between scene JSON and raw AI output, with copy support.
- [x] Replace the first two video metadata cards with inference, render, and encode timings.
- [x] Run targeted verification and document the result.

### Review

- Added a shared scene/raw-output toggle to the home and playground preview panels, with copy behavior following the active view.
- Extended the prompt-to-video data flow so the client receives raw AI output plus AI inference timing, and the render response now carries render/encode timings from the Rust engine.
- Replaced the top metadata cards in the render result UI so the first visible stats are now `Inference`, `Render`, and `Encode` instead of `Job` and `Codec`.

### Verification

- `bun test app/api/render/route.test.ts`
- `bun x tsc --noEmit`
- `bun x ultracite check`
- `cargo test` in `engine/`
- `cargo build --release` in `engine/`

## Review

- Verified the request flow by reading `app/api/generate-scene/route.ts`, `lib/actions/ai.ts`, `app/api/render/route.ts`, `lib/video/render-video.ts`, `lib/video/renderer.ts`, `lib/video/pre-render.ts`, and `lib/video/encoder.ts`.
- Confirmed that frame drawing uses `skia-canvas`, per-frame scene resolution happens in application code, and final MP4 creation is delegated to `ffmpeg` with a platform-dependent codec default.

---

## Rust Render Engine

- [x] Phase 1: Serde structs mirroring Zod schemas (schema.rs)
- [x] Phase 2: CLI scaffold with JSON deserialization (main.rs, Cargo.toml)
- [x] Phase 3: Topo-sort anchor/place layout engine (layout.rs)
- [x] Phase 4: Easing + timeline interpolation (animation.rs)
- [x] Phase 5: tiny-skia rendering — rect + text nodes (render.rs)
- [x] Phase 6: H.264 encoding via ffmpeg CLI pipe (encode.rs)
- [x] Phase 7: TypeScript bridge + RENDER_ENGINE=rust feature flag (render-rust.ts)

### Verification

- Compiled and ran the Rust engine against the sample fixture (640x360, 60fps, 24 frames).
- Output: valid H.264 MP4 with correct dimensions and frame rate.
- Feature flag: set `RENDER_ENGINE=rust` in `.env.local` to use the Rust path.

---

## Render Route Test

- [x] Inspect the render route contract and current test setup.
- [x] Add a focused route test using the provided render payload.
- [x] Verify success and error handling with targeted test execution and linting.

### Review

- Added `app/api/render/route.test.ts` with focused route tests for success, malformed JSON, and propagated app-error responses.
- Verified the focused Bun test file passes: `bun test app/api/render/route.test.ts`.
- Smoke-tested the real route with the provided payload; it returned `200` and wrote an MP4 via the Rust engine to `public/renders/2e4b3c73-4a0b-44e6-a8b3-804e8e8c4263.mp4`.
- Updated `lib/video/render-rust.ts` to use Bun process/file APIs (`spawn`, `write`, `file().delete()`), then re-ran the live render smoke test successfully.

---

## Rust Pipeline Review

- [x] Inspect the Rust engine entry points, animation/layout pipeline, renderer, text handling, and encoder.
- [x] Run `cargo test` for the `engine` crate.
- [x] Run `cargo clippy --all-targets --locked -- -D warnings` for the `engine` crate.
- [x] Summarize correctness, clarity, simplicity, abstraction, reuse, and caching findings.

### Review

- The pipeline is conceptually simple at a high level: deserialize scene JSON, resolve animation state per frame, compute layout, render RGBA with Skia, then encode via FFmpeg.
- The main quality risks are silent failure paths in layout/render resolution, missing validation for invalid scene structure, schema surface area that exceeds the implemented renderer, and a “precomputed” path that still repeats substantial per-frame work.
- Verification: `cargo test` passed with 1 unit test; `cargo clippy --all-targets --locked -- -D warnings` failed on `clippy::unnecessary_map_or` in `engine/src/render.rs:37`.

### Validation Follow-up

- Added focused validation tests in `engine/src/pipeline_review_tests.rs`.
- Verified current behavior with `cargo test pipeline_review_tests -- --nocapture`:
  - Zero-duration scenes currently panic from unsigned underflow.
  - Layout resolution failures currently degrade into `(0, 0)` placement instead of returning an error.
  - `image` nodes are currently accepted by the shared schema but dropped by the Rust resolver.
- Re-ran the full crate suite with `cargo test`; all 4 tests passed.

---

## Rust Pipeline Fixes

- [x] Remove unsupported node kinds from the shared TypeScript and Rust schemas.
- [x] Make Rust layout resolution fail explicitly for invalid trees instead of silently falling back.
- [x] Reject invalid scene durations/frame ranges in the Rust engine.
- [x] Add focused regression tests for the tightened schema and Rust pipeline behavior.
- [x] Run targeted verification, create small commits, and push `refactor-rust`.

### Review

- Tightened the shared video schema to accept only node kinds the Rust renderer actually supports: `align`, `center`, `icon`, `rect`, `stack`, and `text`.
- Hardened the Rust engine to reject invalid scene durations, missing child references, and reachable child cycles instead of rendering silently corrupted frames.
- Added Bun and Rust regression tests to lock in the schema boundary and invalid-scene behavior.
- Added a small AI conversion guard so generated durations never round down to zero frames.

### Verification

- `bun test lib/video/schema.test.ts app/api/render/route.test.ts lib/video/lucide.test.ts`
- `bun x tsc --noEmit`
- `cargo test` in `engine/`
- `cargo clippy --all-targets --locked -- -D warnings` in `engine/`

---

## Home Preview Panel Height

- [x] Remove the left-column fixed-height workaround from the home preview panel.
- [x] Give the home preview panel itself a bounded height so both columns stretch to the same row height.
- [x] Reuse the same inner sizing pattern as the playground preview panel and verify linting.

---

## LaTeX Math Rendering

- [x] Detect display-math text nodes wrapped in `$$...$$` during AI node resolution.
- [x] Convert LaTeX into MathJax SVG, flatten the SVG into path primitives, and reuse the existing icon renderer.
- [x] Teach the AI prompt catalog that `$$...$$` renders display math.
- [x] Add focused regression tests for LaTeX parsing and node conversion.
- [x] Verify Bun tests, TypeScript, Ultracite, Rust tests, Clippy, Rust release build, and Next.js production build.

### Review

- Added `lib/video/latex.ts`, which uses MathJax to render display math and converts the resulting SVG into flattened path primitives that fit the existing `icon` node contract.
- Updated `resolveAiSceneNodes()` so AI-generated text nodes wrapped in `$$...$$` become filled icon nodes while preserving layout and transform properties.
- Updated the prompt catalog to explicitly tell the model to wrap display math in `$$...$$` when LaTeX rendering is desired.

### Verification

- `bun test`
- `bun x tsc --noEmit`
- `bun x ultracite check`
- `cargo test` in `engine/`
- `cargo clippy --all-targets --locked -- -D warnings` in `engine/`
- `cargo build --release` in `engine/`
- `bun run build`
