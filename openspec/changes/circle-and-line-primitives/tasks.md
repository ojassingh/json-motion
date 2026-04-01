## 1. Rust Schema (engine/src/schema.rs)

- [ ] 1.1 Add `CircleNode` struct with fields: `base: NodeBase`, `radius: f64`, `fill: Option<String>`, `stroke: Option<String>`, `stroke_width: Option<f64>`, `draw_progress: Option<f64>`
- [ ] 1.2 Add `LineNode` struct with fields: `base: NodeBase`, `x1: f64`, `y1: f64`, `x2: f64`, `y2: f64`, `stroke: Option<String>`, `stroke_width: Option<f64>`, `cap: Option<LineCap>`, `draw_progress: Option<f64>`
- [ ] 1.3 Add `LineCap` enum with variants `Round`, `Square`, `Butt` (with serde rename to lowercase)
- [ ] 1.4 Add `Circle(CircleNode)` and `Line(LineNode)` variants to the `Node` enum
- [ ] 1.5 Update `Node::base()` match arm to handle the two new variants

## 2. Resolved Types (engine/src/shared/types.rs)

- [ ] 2.1 Add `ResolvedCircle` struct with: `x`, `y`, `radius`, `fill: Option<(u8,u8,u8)>`, `stroke: Option<(u8,u8,u8)>`, `stroke_width`, `draw_progress`, `opacity`, `rotate`, `scale_x`, `scale_y`, `skew_x`, `skew_y`, `z_index`
- [ ] 2.2 Add `ResolvedLine` struct with: `x`, `y`, `x1`, `y1`, `x2`, `y2`, `stroke: (u8,u8,u8)`, `stroke_width`, `cap`, `draw_progress`, `opacity`, `rotate`, `scale_x`, `scale_y`, `skew_x`, `skew_y`, `z_index`
- [ ] 2.3 Add `Circle(ResolvedCircle)` and `Line(ResolvedLine)` variants to `ResolvedNodeData` enum

## 3. Animation Resolver (engine/src/animation/frame.rs)

- [ ] 3.1 Add `resolve_circle_node` function that computes per-frame values for all circle properties using `NodeTracks`
- [ ] 3.2 Add `resolve_line_node` function that computes per-frame values for all line properties using `NodeTracks`
- [ ] 3.3 Add `"radius"`, `"x1"`, `"y1"`, `"x2"`, `"y2"`, `"drawProgress"` (if not already added by PR 1) to `NUMERIC_TRACK_PROPERTIES`
- [ ] 3.4 Update the main `resolve_node` dispatch to call the two new functions
- [ ] 3.5 Update `get_node_bounding_box` (or equivalent layout sizing function) to return `(2*radius, 2*radius)` for circle nodes, and `(|x2-x1|, |y2-y1|)` for line nodes

## 4. Renderer (engine/src/render.rs)

- [ ] 4.1 Add `draw_circle` function: when `draw_progress >= 1.0`, call `canvas.draw_oval(rect, &paint)`; when `draw_progress < 1.0`, call Skia arc draw API with sweep angle `= 360.0 * draw_progress` starting at 270°
- [ ] 4.2 Add `draw_line` function: compute the end point as `lerp(start, end, draw_progress)`, call `canvas.draw_line(start, end_point, &paint)` with the configured stroke paint and line cap
- [ ] 4.3 Update the main render dispatch to handle `ResolvedNodeData::Circle` and `ResolvedNodeData::Line`

## 5. TypeScript Schema (lib/video/schema.ts)

- [ ] 5.1 Add `videoCircleNodeSchema` with `type: "circle"`, `radius`, optional `fill`, `stroke`, `strokeWidth`, `drawProgress`, and base props
- [ ] 5.2 Add `videoLineNodeSchema` with `type: "line"`, `x1`, `y1`, `x2`, `y2`, optional `stroke`, `strokeWidth`, `cap` enum, `drawProgress`, and base props
- [ ] 5.3 Add both schemas to the `videoNodeSchema` discriminated union
- [ ] 5.4 Add both schemas to the `videoAiNodeSchema` discriminated union

## 6. Types (lib/types/video.ts)

- [ ] 6.1 Export `VideoCircleNode` and `VideoLineNode` types

## 7. Catalog (lib/ai/prompt-to-video-config.ts)

- [ ] 7.1 Add `circle` catalog entry: "Renders a circle or ellipse. Use for neurons, atoms, Venn diagram regions, orbits, or any round shape. Animate `drawProgress` from 0 to 1 to draw the circle stroke progressively."
- [ ] 7.2 Add `line` catalog entry: "Renders a straight line segment. Use for vectors, number lines, axes, or geometric constructions. Prefer `arrow` for labeled connectors. Animate `drawProgress` to grow the line from start to end."
- [ ] 7.3 Import and pass the new Zod schemas as `propSchema` for both catalog entries

## 8. Layout Integration (engine/src/layout.rs)

- [ ] 8.1 Add circle node to the layout size calculation: bounding box = `(2 * radius, 2 * radius)`
- [ ] 8.2 Add line node to the layout size calculation: bounding box = `(abs(x2-x1), abs(y2-y1))`

## 9. Verification

- [ ] 9.1 Add a benchmark test case in `scripts/benchmark-engine.ts` with a circle and a line node, verify render produces non-empty frame
- [ ] 9.2 Run `cargo test` in `engine/` and verify no regressions
- [ ] 9.3 Run `bun run scripts/prompt-to-video-smoke.ts` with "show a neural network" and verify the output uses circle nodes for neurons
