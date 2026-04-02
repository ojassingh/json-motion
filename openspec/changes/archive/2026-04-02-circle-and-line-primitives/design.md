## Context

The Rust engine's `Node` enum in `schema.rs` uses a `#[serde(tag = "type")]` discriminated union. Adding a new node type requires: (1) a new variant in the `Node` enum, (2) a corresponding `ResolvedNode` variant in `shared/types.rs`, (3) a resolve function in `animation/frame.rs`, and (4) a draw function in `render.rs`. The pattern is established and consistent across the existing node types. Skia-safe provides `canvas.draw_oval()` for circles and `canvas.draw_line()` for line segments.

The TS side mirrors the engine schema via Zod in `schema.ts`. The AI-facing schema adds these types to the `videoAiNodeSchema` union and the catalog adds descriptions.

## Goals / Non-Goals

**Goals:**
- `circle` and `line` nodes render correctly in the Rust engine
- Both support `drawProgress` animation (circle draws as an arc from 0 to 2π; line grows from start to end point)
- Both are available in the AI catalog with clear educational use-case descriptions
- Layout nodes (`center`, `stack`, `align`) treat circle and line as regular children

**Non-Goals:**
- Ellipses as a distinct type (a circle with `scaleX`/`scaleY` handles this)
- Curved lines / Bézier paths (that would be a separate `path` node type)
- Polygon / triangle nodes (follow-on work)
- 3D geometry

## Decisions

**`circle` uses `radius`, not `width`/`height`**

Semantically cleaner. `radius` is the natural property for a circle. The engine computes the bounding box as `(2*radius) × (2*radius)` for layout. If the AI wants an ellipse it can use `scaleX`/`scaleY` transforms.

**`circle` with `drawProgress` draws as a Skia arc sweep**

When `drawProgress < 1`, the circle is rendered as a partial arc from the top (12 o'clock) sweeping clockwise by `360 * drawProgress` degrees. This produces the "self-drawing circle" animation that is visually compelling. Skia's `draw_arc` supports this natively.

**`line` uses absolute `x1,y1,x2,y2` coordinates, not relative length + angle**

Consistent with the arrow node's `from`/`to` pattern. The AI finds it easier to specify where a line starts and ends than to specify an angle and length. The engine computes the line length for `drawProgress` interpolation (grows from `x1,y1` toward `x2,y2`).

**`line` base position `x`/`y` acts as an offset to all four endpoints**

So `x`/`y` from the base node plus layout-computed position is added to `x1,y1` and `x2,y2`. This lets layout nodes center a line while keeping the line's internal geometry relative.

**Both nodes support `fill` and `stroke` independently**

`circle` can be fill-only, stroke-only, or both. `line` only uses `stroke` (lines have no fill).

## Risks / Trade-offs

- **Risk**: `circle` bounding box for layout differs from its visual center when `strokeWidth` is large → **Mitigation**: document that `radius` is the center-to-edge distance, `strokeWidth` extends outward; layout uses `2*radius` as the nominal box
- **Risk**: AI generates lines with confusing `x1,y1,x2,y2` values when layout nodes would be cleaner → **Mitigation**: catalog description notes that lines are for explicit coordinate-based geometry; connectors between nodes should use `arrow` instead
- **Risk**: `drawProgress` on circle requires arc drawing vs. full oval draw — different Skia call → **Mitigation**: the render function branches on `drawProgress < 1.0` to use `draw_arc` vs `draw_oval`
