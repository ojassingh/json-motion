## Why

The project is still a starter app, but the intended product is a programmable video engine where agents describe motion and composition as structured data instead of imperative UI code. We need a spec-first plan now so the renderer, animation model, and API contract stay deterministic as the implementation grows across GPU rendering, validation, and encoding.

## What Changes

- Add a typed video description model that represents scenes, nodes, transforms, timing, and reusable animation primitives as deterministic input data.
- Add a frame rendering pipeline that resolves animations per frame, traverses the scene graph in a predictable order, and rasterizes supported nodes through Skia-backed canvas APIs.
- Add an MP4 export pipeline that streams raw RGBA frames into a system `ffmpeg` process for hardware-accelerated H.264 or H.265 output.
- Add a server render entrypoint that validates incoming render requests, invokes the renderer, writes an output file, and returns a URL for the generated video.
- Define the initial supported primitives and effects needed for local end-to-end testing, including scene backgrounds, groups, text, images, shapes, and basic enter animations.

## Capabilities

### New Capabilities
- `video-scene-schema`: Defines the render request shape for video metadata, scenes, nodes, transforms, and animations.
- `frame-rendering-pipeline`: Defines deterministic frame resolution and rasterization behavior for scene graph playback.
- `render-api`: Defines the server contract for validating render jobs, producing MP4 files, and returning a retrievable output location.

### Modified Capabilities
- None.

## Impact

- Affected code will include new renderer modules, animation math, API route handlers, validation schemas, and local output storage utilities.
- New runtime dependencies are expected for `skia-canvas`, `zod`, and use of the system `ffmpeg` binary.
- The implementation introduces a non-trivial rendering pipeline inside a Next.js codebase and will likely require clear boundaries between pure scene math, rasterization, and server-side orchestration.
