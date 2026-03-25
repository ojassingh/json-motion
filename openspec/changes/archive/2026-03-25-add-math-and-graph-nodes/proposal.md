## Why

The renderer currently supports rect, text, image, and group nodes — enough for motion graphics but not for educational or technical content. Adding Math (LaTeX), FunctionGraph, and ParametricGraph nodes unlocks STEM explainer videos, equation walkthroughs, and data-driven animations without leaving the declarative scene format. Pre-rendering these heavy computations outside the frame loop keeps the deterministic frame pipeline fast.

## What Changes

- Add a `math` node type that accepts a `latex` string and renders it as a pre-rasterized SVG image via MathJax's server-side `tex2svg` (dependency: `mathjax-full`).
- Add a `functionGraph` node type that evaluates a math expression string across an x-range, samples points, and draws an animated curve with optional axes and grid (dependency: `mathjs`).
- Add a `parametricGraph` node type that evaluates paired `fnX(t)` / `fnY(t)` expressions across a t-range and draws an animated parametric curve.
- Introduce a structured pre-render lifecycle phase that runs **once** before the frame loop: validate → preload images → pre-render math → pre-sample graphs → begin frame loop. The frame loop only reads from caches.
- Update the AI system prompt to include the new node types so the model can generate scenes that use them.
- Add an integration test that makes a real AI request, validates the output against the schema, and confirms no errors are thrown during rendering.

## Capabilities

### New Capabilities
- `math-node-rendering`: Schema, resolution, pre-rendering (MathJax tex2svg → Skia image cache), and per-frame drawing for the `math` node type.
- `graph-node-rendering`: Schema, resolution, pre-sampling (mathjs compile + evaluate), and per-frame animated drawing for `functionGraph` and `parametricGraph` node types.
- `pre-render-lifecycle`: Orchestration of all pre-render steps (image preload, math pre-render, graph pre-sample) that run once before the frame loop.

### Modified Capabilities
- `video-scene-schema`: The node discriminated union expands to include `math`, `functionGraph`, and `parametricGraph` types with their respective properties and animate schemas.
- `frame-rendering-pipeline`: The renderer gains draw paths for the three new node types and the render entry point calls the pre-render phase before frame iteration.
- `prompt-to-video-api`: The system prompt is updated to include the new node types, their properties, and usage guidance so the AI model can generate scenes that use them.

## Impact

- **Dependencies**: `mathjax-full` (runtime) and `mathjs` (runtime) are added to `package.json`.
- **Schema** (`lib/video/schema.ts`): New Zod schemas for `math`, `functionGraph`, `parametricGraph` nodes join the discriminated union.
- **Types** (`lib/types/video.ts`): New authored and resolved type variants.
- **Animation** (`lib/video/animation.ts`): New resolve functions for each node type.
- **Renderer** (`lib/video/renderer.ts`): New draw functions; `drawResolvedNode` gains branches for the three types.
- **Render entry** (`lib/video/render-video.ts`): Calls the pre-render phase before the frame generator.
- **New modules**: `lib/video/math.ts` (MathJax pre-render + cache), `lib/video/graph.ts` (mathjs sampling + cache), `lib/video/pre-render.ts` (lifecycle orchestrator).
- **AI config** (`lib/ai/prompt-to-video-config.ts`): System prompt updated with new node documentation.
- **Validation** (`lib/video/validation.ts`): Animation validation extended for new animatable properties.
- **Tests**: New integration test file that hits the real AI and validates end-to-end.
