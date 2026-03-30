- [x] Inspect the AI generation endpoint and schema conversion path.
- [x] Inspect the render endpoint, frame renderer, and encoder pipeline.
- [x] Identify which stages are CPU-bound, GPU-assisted, or codec/hardware dependent.
- [x] Explain the post-JSON flow in plain language for a non-graphics audience.

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
