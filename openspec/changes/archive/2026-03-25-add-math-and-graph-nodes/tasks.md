## 1. Dependencies

- [x] 1.1 Add `mathjax-full` to runtime dependencies in `package.json`
- [x] 1.2 Add `mathjs` to runtime dependencies in `package.json`
- [x] 1.3 Run `bun install` and verify both packages resolve without errors

## 2. Schema (lib/video/schema.ts)

- [x] 2.1 Add `videoMathAnimateSchema` extending the base animate schema (no extra animatable props beyond base)
- [x] 2.2 Add `videoFunctionGraphAnimateSchema` extending the base animate schema with `drawProgress`, `color`, and `strokeWidth`
- [x] 2.3 Add `videoParametricGraphAnimateSchema` extending the base animate schema with `drawProgress`, `color`, and `strokeWidth`
- [x] 2.4 Add interface types `VideoMathNodeSchemaType`, `VideoFunctionGraphNodeSchemaType`, `VideoParametricGraphNodeSchemaType` and include them in the `VideoNodeSchemaType` union
- [x] 2.5 Add `videoMathNodeSchema` with required `latex`, `fontSize`, `width`, `height` and optional `color`
- [x] 2.6 Add `videoFunctionGraphNodeSchema` with required `fn`, `xRange`, `yRange`, `width`, `height` and optional `color`, `strokeWidth`, `showAxes`, `showGrid`, `drawProgress`
- [x] 2.7 Add `videoParametricGraphNodeSchema` with required `fnX`, `fnY`, `tRange`, `width`, `height` and optional `color`, `strokeWidth`, `drawProgress`, `samples`
- [x] 2.8 Add all three new schemas to the `videoNodeSchema` discriminated union

## 3. Types (lib/types/video.ts)

- [x] 3.1 Add `VideoMathNode`, `VideoFunctionGraphNode`, `VideoParametricGraphNode` extracted types
- [x] 3.2 Add `ResolvedMathNode`, `ResolvedFunctionGraphNode`, `ResolvedParametricGraphNode` interfaces
- [x] 3.3 Add the three new resolved types to the `ResolvedVideoNode` union

## 4. Animation Resolver (lib/video/animation.ts)

- [x] 4.1 Add `resolveMathNode` function that resolves base transforms plus `fontSize` and `color`
- [x] 4.2 Add `resolveFunctionGraphNode` function that resolves base transforms plus `drawProgress`, `color`, `strokeWidth`, `showAxes`, `showGrid`
- [x] 4.3 Add `resolveParametricGraphNode` function that resolves base transforms plus `drawProgress`, `color`, `strokeWidth`
- [x] 4.4 Add explicit animation extraction functions for each new type (`getMathExplicitAnimations`, `getFunctionGraphExplicitAnimations`, `getParametricGraphExplicitAnimations`)
- [x] 4.5 Update `normalizeNodeAnimations` and `resolveVideoNode` to handle the three new types

## 5. Validation (lib/video/validation.ts)

- [x] 5.1 Add animation validation for `math` nodes (base animate properties only)
- [x] 5.2 Add animation validation for `functionGraph` nodes (`drawProgress`, `color`, `strokeWidth`)
- [x] 5.3 Add animation validation for `parametricGraph` nodes (`drawProgress`, `color`, `strokeWidth`)

## 6. Math Pre-render (lib/video/math.ts)

- [x] 6.1 Create `lib/video/math.ts` with a `preRenderMathNodes` function that scans the scene tree for math nodes
- [x] 6.2 Implement MathJax `tex2svg` integration: collect unique `(latex, color)` pairs, call `tex2svg`, produce SVG strings
- [x] 6.3 Load each SVG string into a Skia image using `loadImage` from skia-canvas
- [x] 6.4 Return a `Map<string, Image>` keyed by `${latex}::${color}`
- [x] 6.5 Wrap MathJax errors in `AppError` with code `PRERENDER_ERROR`

## 7. Graph Pre-sample (lib/video/graph.ts)

- [x] 7.1 Create `lib/video/graph.ts` with a `preSampleGraphNodes` function that scans the scene tree for graph nodes
- [x] 7.2 Implement `sampleFunctionGraph`: compile `fn` with mathjs, sample N=width points across xRange, clamp to yRange, map to pixel coords, skip NaN/Infinity
- [x] 7.3 Implement `sampleParametricGraph`: compile `fnX`/`fnY` with mathjs, sample N=samples points across tRange, map to pixel coords centered in bounding box, skip NaN/Infinity
- [x] 7.4 Return a `Map<string, Array<{ x: number; y: number }>>` keyed by node ID
- [x] 7.5 Wrap mathjs compilation/evaluation errors in `AppError` with code `PRERENDER_ERROR`

## 8. Pre-render Lifecycle (lib/video/pre-render.ts)

- [x] 8.1 Create `lib/video/pre-render.ts` with a `preRenderVideo` function
- [x] 8.2 Implement scene tree scanning to collect image, math, and graph nodes
- [x] 8.3 Orchestrate: preload images → pre-render math → pre-sample graphs, return combined cache object
- [x] 8.4 Define `PreRenderCaches` type containing the math image cache and graph point cache

## 9. Renderer (lib/video/renderer.ts)

- [x] 9.1 Add `drawMathNode` function that looks up `(latex, color)` in the math cache and draws the Skia image with fontSize-based scaling
- [x] 9.2 Add `drawFunctionGraphNode` function that clips points by `drawProgress`, strokes the curve, and optionally draws axes/grid
- [x] 9.3 Add `drawParametricGraphNode` function that clips points by `drawProgress` and strokes the curve
- [x] 9.4 Update `drawResolvedNode` to dispatch to the three new draw functions
- [x] 9.5 Update `renderFrameToRgba` to accept and pass `PreRenderCaches` to draw functions
- [x] 9.6 Update `getNodeDimensions` to handle the three new resolved node types

## 10. Render Entry Point (lib/video/render-video.ts)

- [x] 10.1 Call `preRenderVideo` after validation and before `createFrameStream`
- [x] 10.2 Pass `PreRenderCaches` into `createFrameStream` and through to `renderFrameToRgba`

## 11. AI System Prompt (lib/ai/prompt-to-video-config.ts)

- [x] 11.1 Add `math`, `functionGraph`, `parametricGraph` to `SUPPORTED_NODE_TYPES`
- [x] 11.2 Add documentation in the system prompt explaining the new node types, their required/optional properties, and usage examples
- [x] 11.3 Add guidance for when to use each type (math for equations, functionGraph for y=f(x), parametricGraph for parametric curves)

## 12. Integration Test

- [x] 12.1 Create `tests/ai/generate-math-video.test.ts` that calls the real AI (`generateVideoDescriptionFromPrompt`) with a math/graph-focused prompt
- [x] 12.2 Validate the AI output passes `videoDescriptionSchema.safeParse` without errors
- [x] 12.3 Validate the AI output contains at least one of the new node types (`math`, `functionGraph`, or `parametricGraph`)
- [x] 12.4 Call `renderVideo` on the AI output and assert no errors are thrown, confirming the full pipeline (pre-render → frame loop → encode) works end-to-end
- [x] 12.5 Verify the rendered output file exists and has a non-zero file size

## 13. Linting and Type Checking

- [x] 13.1 Run `bun x ultracite fix` and resolve any formatting or lint issues
- [x] 13.2 Run `bun run typecheck` and resolve any type errors (ensure zero type casts)
- [x] 13.3 Run existing test suite (`bun test`) and confirm no regressions
