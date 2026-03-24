## 1. Setup and boundaries

- [x] 1.1 Add the required runtime dependencies (`skia-canvas`, `zod`) and document the local `ffmpeg` prerequisite.
- [x] 1.2 Create the shared server-side video module structure for schema, timeline resolution, rasterization, encoding, storage, and API errors.
- [x] 1.3 Add shared render configuration for output directories, filename generation, and platform-specific codec defaults.

## 2. Scene schema and animation resolution

- [x] 2.1 Implement the Zod schema and inferred TypeScript types for video metadata, scenes, supported nodes, transforms, and animation primitives.
- [x] 2.2 Add validation helpers for duplicate node ids, invalid scene frame windows, and animation ranges that exceed scene duration.
- [x] 2.3 Implement pure scene and frame resolution utilities that select the active scene and compute frame-local timing.
- [x] 2.4 Implement deterministic transform resolution for base values, keyframes, and the initial named effects (`fade-in`, `slide-in`, `scale-in`).

## 3. Rendering and encoding pipeline

- [x] 3.1 Implement the Skia canvas renderer that clears the scene background and prepares a frame-sized drawing surface for each frame.
- [x] 3.2 Implement recursive draw functions for `group`, `rect`, `text`, and `image` nodes with stable `zIndex` ordering and documented transform composition.
- [x] 3.3 Implement raw RGBA frame extraction and a streaming `ffmpeg` encoder wrapper that writes a single MP4 file.
- [x] 3.4 Implement local output storage that saves rendered MP4 files into a server-accessible public directory and returns job metadata.

## 4. API and verification

- [x] 4.1 Add the `POST /api/render` route that validates requests, invokes the render service, and returns the output URL plus job id.
- [x] 4.2 Normalize validation, asset loading, rendering, and encoding failures into machine-readable API error responses.
- [x] 4.3 Add automated tests for schema validation, scene timing, and pure animation resolution behavior.
- [x] 4.4 Add a local end-to-end render fixture and update the README with setup instructions and API usage for local testing.
