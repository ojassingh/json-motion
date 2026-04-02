## 1. Dependencies

- [x] 1.1 Add `mathjs` to `package.json` runtime dependencies: `bun add mathjs`
- [x] 1.2 Verify `bun install` resolves mathjs without errors

## 2. TS Pre-sampling (lib/video/graph.ts — new file)

- [x] 2.1 Create `lib/video/graph.ts` and export `preComputeGraphNodes(scenes: VideoAiScene[]): VideoAiScene[]`
- [x] 2.2 Implement `sampleFunctionGraph(node)`: compile `node.fn` with mathjs, sample `node.width` x-values evenly across `node.xRange`, evaluate each, map valid pairs to pixel coords (flip y-axis: `pixelY = height - ((y - yMin) / (yMax - yMin)) * height`), skip NaN/Infinity
- [x] 2.3 Implement `sampleParametricGraph(node)`: compile `node.fnX` and `node.fnY` with mathjs, sample `node.samples` (default 500) t-values across `node.tRange`, evaluate each pair, auto-scale to fit `(width, height)` bounding box centered, skip NaN/Infinity
- [x] 2.4 Wrap mathjs `compile()` and `.evaluate()` errors in a thrown error with code `PRERENDER_ERROR` and the offending expression in the message
- [x] 2.5 Attach `points` array to each node and return the modified scenes

## 3. Pipeline Integration (lib/actions/ai.ts)

- [x] 3.1 Import `preComputeGraphNodes` from `lib/video/graph.ts`
- [x] 3.2 Call `preComputeGraphNodes` inside `convertAiOutputToVideoDescription`, after macro expansion and node resolution, before the final `videoDescriptionSchema.parse`

## 4. TypeScript Schema (lib/video/schema.ts)

- [x] 4.1 Add `videoAiFunctionGraphNodeSchema` with AI-facing fields: `fn`, `xRange`, `yRange`, `width`, `height`, optional `color`, `strokeWidth`, `showAxes`, `showGrid`, `drawProgress`, and base props. No `points` field.
- [x] 4.2 Add `videoAiParametricGraphNodeSchema` with AI-facing fields: `fnX`, `fnY`, `tRange`, `width`, `height`, optional `color`, `strokeWidth`, `drawProgress`, `samples`, and base props. No `points` field.
- [x] 4.3 Add `videoFunctionGraphNodeSchema` (engine-facing) — same as AI schema but with additional required `points: z.array(z.object({ x: z.number(), y: z.number() }))`
- [x] 4.4 Add `videoParametricGraphNodeSchema` (engine-facing) — same as AI schema but with required `points`
- [x] 4.5 Add both engine-facing schemas to `videoNodeSchema` discriminated union
- [x] 4.6 Add both AI-facing schemas to `videoAiNodeSchema` discriminated union

## 5. Types (lib/types/video.ts)

- [x] 5.1 Export `VideoFunctionGraphNode`, `VideoParametricGraphNode`, `VideoAiFunctionGraphNode`, `VideoAiParametricGraphNode` types

## 6. Rust Schema (engine/src/schema.rs)

- [x] 6.1 Add `GraphPoint` struct: `{ x: f64, y: f64 }` with serde derive
- [x] 6.2 Add `FunctionGraphNode` struct with fields: `base: NodeBase`, `points: Vec<GraphPoint>`, `color: Option<String>`, `stroke_width: Option<f64>`, `show_axes: Option<bool>`, `show_grid: Option<bool>`, `draw_progress: Option<f64>`, `x_range: Option<[f64; 2]>`, `y_range: Option<[f64; 2]>`
- [x] 6.3 Add `ParametricGraphNode` struct with fields: `base: NodeBase`, `points: Vec<GraphPoint>`, `color: Option<String>`, `stroke_width: Option<f64>`, `draw_progress: Option<f64>`
- [x] 6.4 Add `FunctionGraph(FunctionGraphNode)` and `ParametricGraph(ParametricGraphNode)` variants to the `Node` enum
- [x] 6.5 Update `Node::base()` to handle the two new variants

## 7. Resolved Types (engine/src/shared/types.rs)

- [x] 7.1 Add `ResolvedFunctionGraph` struct: `x`, `y`, `points: Vec<(f64, f64)>`, `color: (u8,u8,u8)`, `stroke_width`, `show_axes`, `show_grid`, `draw_progress`, `x_range: Option<[f64; 2]>`, `y_range: Option<[f64; 2]>`, transform fields
- [x] 7.2 Add `ResolvedParametricGraph` struct: `x`, `y`, `points: Vec<(f64, f64)>`, `color: (u8,u8,u8)`, `stroke_width`, `draw_progress`, transform fields
- [x] 7.3 Add both to `ResolvedNodeData` enum

## 8. Animation Resolver (engine/src/animation/frame.rs)

- [x] 8.1 Add `resolve_function_graph_node` — resolves base transforms plus `draw_progress`, `color`, `stroke_width`
- [x] 8.2 Add `resolve_parametric_graph_node` — same
- [x] 8.3 Ensure `"drawProgress"` is in `NUMERIC_TRACK_PROPERTIES` (should be done by PR 1; verify here)
- [x] 8.4 Update main resolve dispatch for both new types

## 9. Renderer (engine/src/render.rs)

- [x] 9.1 Add `draw_function_graph` function: clip `points` array to `floor(len * draw_progress)`, build Skia `Path` with `move_to` + `line_to` calls, stroke with configured paint; when `show_axes`, draw horizontal and vertical axis lines; when `show_grid`, draw 5–10 evenly-spaced grid lines in a muted color
- [x] 9.2 Add `draw_parametric_graph` function: identical to `draw_function_graph` minus axes/grid
- [x] 9.3 Update render dispatch for both types

## 10. Layout Integration (engine/src/layout.rs)

- [x] 10.1 Add bounding box sizing for `FunctionGraph` and `ParametricGraph`: return `(node.width, node.height)` from the declared schema fields (or from the `points` bounding box)

## 11. Catalog (lib/ai/prompt-to-video-config.ts)

- [x] 11.1 Add `functionGraph` catalog entry with description: "Plots y=f(x) for a mathematical function. `fn` is a mathjs expression in `x`. Use for sine waves, parabolas, exponentials, any y=f(x) curve. Animate `drawProgress` from 0 to 1 to draw the curve progressively. Set `showAxes: true` to render axis lines."
- [x] 11.2 Add `parametricGraph` catalog entry: "Plots a parametric curve (fnX(t), fnY(t)). Use for circles, spirals, Lissajous figures, or any curve that can't be expressed as y=f(x). Both `fnX` and `fnY` must be mathjs expressions in `t`."
- [x] 11.3 Add example recipes to the catalog prompt showing how to animate a sine wave for a physics lecture

## 12. Tests

- [x] 12.1 Add unit tests in `lib/video/graph.test.ts` for `sampleFunctionGraph`: identity function maps correctly, `1/x` at x=0 produces a gap, invalid expression throws `PRERENDER_ERROR`
- [x] 12.2 Add unit test for `sampleParametricGraph`: cos/sin circle produces ≈500 points in a circular distribution
- [x] 12.3 Add a benchmark test case in `scripts/benchmark-engine.ts` with a functionGraph node and pre-sampled points; verify render produces non-empty frame

## 13. Smoke Test

- [x] 13.1 Run prompt-to-video smoke test with "plot sin(x) and cos(x) on the same graph" — verify output contains functionGraph nodes with populated `points` arrays
- [x] 13.2 Run smoke test with "visualize projectile motion trajectory" — verify a parametricGraph or functionGraph node is used for the trajectory arc
