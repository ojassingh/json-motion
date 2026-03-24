## Context

The repository is currently a minimal Next.js 16 / React 19 application with no rendering engine, API contract, or server-side media pipeline. The requested change adds a deterministic video runtime that starts from structured scene data, resolves animations as pure math, rasterizes frames on the server, and encodes those frames into an MP4 that can be fetched locally.

The implementation has a few hard constraints:

- Rendering must be deterministic so agents can reason about timeline and composition without frame-by-frame imperative code.
- The animation layer must stay render-agnostic so future backends are not coupled to Skia internals.
- The first integration must work inside the existing Next.js app even though the longer-term platform may also expose the same service through Elysia.
- Local testing depends on native tooling: `skia-canvas` for GPU-backed 2D drawing and a system `ffmpeg` binary for encoding.

## Goals / Non-Goals

**Goals:**

- Define a typed `VideoDescription` contract for video metadata, scene timing, scene graph nodes, transforms, and declarative animations.
- Separate pure frame-resolution logic from rasterization and encoding so the math layer can be tested without GPU or file I/O.
- Render a minimal but useful node set for local testing: scene background, group, rect, text, and image.
- Expose a server entrypoint that validates requests, renders to a local MP4 file, and returns a retrievable URL.
- Keep the implementation modular enough to support a later Elysia adapter without rewriting the render core.

**Non-Goals:**

- Audio mixing, subtitles, or multi-track timelines.
- Distributed jobs, background workers, or persistent job orchestration.
- Browser-side preview rendering.
- Full chart and table primitives in the first implementation.
- A generalized plugin system for custom effects or codecs.

## Decisions

### 1. Use a layered renderer architecture under a shared server module boundary

The implementation should live under a shared server-only module tree such as `lib/video/` with submodules for schema, timeline resolution, rasterization, encoding, and storage. The Next.js route handler should only validate input, call the render service, and shape the HTTP response.

Rationale:

- It keeps framework concerns separate from rendering concerns.
- It makes a later Elysia route wrapper a thin adapter instead of a second implementation.
- It allows pure units like timing and transform resolution to be tested without HTTP or native bindings.

Alternative considered:

- Putting all logic directly in `app/api/render/route.ts` would be faster initially, but it would tightly couple validation, rendering, and process management into one file and make reuse difficult.

### 2. Model the scene description as discriminated unions plus Zod validation

The core input should be a `VideoDescription` object validated by Zod and exported as inferred TypeScript types. Scenes should carry explicit timing (`startFrame`, `durationInFrames`) and a list of nodes. Nodes should be discriminated by `type` and include a stable `id`, a base transform, optional styling, and optional animations.

Rationale:

- Zod gives one source of truth for API validation and TypeScript inference.
- Discriminated unions make node-specific rendering exhaustive and easier to extend safely.
- Explicit frame values keep the engine deterministic and avoid implicit duration math in the API layer.

Alternative considered:

- Using handwritten TypeScript interfaces alone would leave runtime validation to ad hoc checks and make the API boundary too weak.

### 3. Keep animation resolution pure and frame-based

Animation resolution should accept a scene description and a frame index and return resolved node values for that frame. The resolver should merge base transform values with active keyframes and named effects. Named effects such as `fade-in`, `slide-in`, and `scale-in` should compile into deterministic transform and opacity deltas instead of owning rendering behavior.

Rationale:

- A pure resolver is straightforward to unit test and deterministic by construction.
- Frame-based timing aligns directly with the encoding loop and avoids floating-point drift from real-time clocks.
- Effect compilation keeps the public API ergonomic without hiding math inside renderer-specific code.

Alternative considered:

- Letting draw functions interpret animation payloads directly would duplicate timing logic across node renderers and make behavior harder to reason about.

### 4. Apply transforms in a fixed, documented order before dispatching draw calls

Each node should resolve to a final transform stack applied in a fixed order: anchor translation, rotation, scale, skew, animated translation, then opacity. Group nodes should push their transform once and recursively render children within that scope. Draw order should follow resolved `zIndex`, then source order for ties.

Rationale:

- A fixed composition order makes output predictable for agent-authored descriptions.
- Recursive group rendering matches the scene graph mental model.
- Stable tie-breaking prevents output drift when siblings share the same z-index.

Alternative considered:

- Allowing arbitrary per-node transform order would be more flexible but would dramatically increase authoring complexity and test surface area.

### 5. Rasterize frames with `skia-canvas` and encode with streamed rawvideo to `ffmpeg`

The rasterizer should create a Skia canvas per frame, clear it with the active scene background, render the resolved node tree, and export a raw RGBA buffer. The encoder should spawn the system `ffmpeg` binary, write raw RGBA frames to stdin, and select a default hardware codec based on the local platform, starting with `h264_videotoolbox` on macOS.

Rationale:

- `skia-canvas` keeps rendering server-side and GPU-accelerated without browser dependencies.
- Raw frame streaming avoids slow intermediate image encoding.
- Using the system `ffmpeg` binary keeps codec behavior explicit and avoids JS wrapper abstractions around process control.

Alternative considered:

- Writing PNG frames to disk before encoding would simplify debugging but would multiply I/O, storage churn, and total render time.

### 6. Store outputs in a public local directory and return a direct URL

The first implementation should write MP4 files into a deterministic local directory such as `public/renders/` using generated job ids. The API response should include the job id, output path metadata, and a URL rooted at `/renders/<job-id>.mp4`.

Rationale:

- This keeps the local test loop simple and avoids introducing a storage service.
- Public-file serving is already supported by Next.js with no additional runtime.
- The returned URL is immediately usable by manual testing or a future client UI.

Alternative considered:

- Returning binary video directly from the request would work for tiny jobs but would block reuse and make inspection harder.

## Risks / Trade-offs

- [Native dependency setup] -> Document platform prerequisites early and gate startup with actionable dependency checks for missing `ffmpeg` or Skia failures.
- [Synchronous API latency] -> Keep the first endpoint explicitly local-development oriented and defer background job infrastructure to a later change.
- [Asset loading nondeterminism] -> Restrict the first version to explicit local or remote image sources with pre-render fetch/load failures surfaced before encoding begins.
- [Text rendering differences across machines] -> Use explicit font defaults and document that visual output is only deterministic when fonts are installed consistently.
- [Memory pressure on longer videos] -> Stream frames directly to `ffmpeg` and avoid buffering full videos or frame sequences in memory.

## Migration Plan

1. Add the native/runtime dependencies and document local prerequisites in the project README.
2. Introduce the shared video schema, animation resolver, rasterizer, encoder, and storage modules behind server-only boundaries.
3. Add the Next.js `POST /api/render` route and wire it to the render service.
4. Add unit coverage for schema and animation resolution plus an integration path that exercises a small render end to end.
5. Roll back by removing the route and new dependencies if the native pipeline proves unstable; the change is additive and does not require data migration.

## Open Questions

- Should the first request schema require non-overlapping scenes, or should it support layered scene compositing from day one?
- Do we want to allow remote image URLs immediately, or restrict image sources to local assets until caching rules are defined?
- Should codec selection remain automatic in the service layer, or be exposed as an advanced request option later?
