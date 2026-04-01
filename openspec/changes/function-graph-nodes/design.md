## Context

The Rust engine renders from a static JSON description. It has no expression evaluator and no mathjs binding. Options for getting function graphs into the engine:

1. **TS pre-samples, passes pixel arrays in JSON** — evaluate function on Node.js side, embed `points: [{x, y}]` in the node JSON, engine just strokes the path
2. **Rust evaluates expressions natively** — add an expression evaluator crate to Rust (e.g. `meval`)
3. **TS generates SVG path string, passes to Rust** — convert points to an SVG `d` string, add a generic `path` node to Rust

Option 1 is chosen. It is the simplest, keeps the engine free of expression evaluation complexity, allows mathjs's full feature set (trig, special functions, complex expressions), and follows the same pattern as the MathJax pre-rendering already in the pipeline. The tradeoff is that the JSON payload grows with the points array, but for typical graphs (width ~600px = 600 points) this is negligible.

## Goals / Non-Goals

**Goals:**
- `functionGraph` and `parametricGraph` nodes render as Skia-stroked curves from pre-sampled pixel points
- `drawProgress` clips the number of rendered points for the progressive-draw animation (depends on PR 1)
- `showAxes` renders x/y axis lines through the data-space origin
- `showGrid` renders evenly-spaced grid lines in a muted color
- mathjs evaluation is isolated to the TS pre-sampling step — no evaluation in the Rust frame loop
- Invalid expressions throw `PRERENDER_ERROR` before any frame is rendered

**Non-Goals:**
- Scatter plots, bar charts, or other non-continuous graph types (separate future work)
- Interactive graphs (out of scope for rendered video)
- Axis tick labels (the engine draws the axis lines; label text nodes can be added by the AI separately)

## Decisions

**Pre-sample on TS side, pass `points` in JSON**

Engine schema for `functionGraph` includes an optional `points: Vec<{x: f64, y: f64}>` field. When present, the engine renders from it. The TS pipeline always populates `points` before sending to the engine. The AI-facing schema does NOT include `points` — the AI only specifies `fn`, `xRange`, `yRange`, `width`, `height`.

**`convertAiOutputToVideoDescription` is the pre-sampling integration point**

After macro expansion and node resolution, before engine validation, a new `preComputeGraphNodes(scenes)` pass scans for graph nodes and embeds `points`. This keeps the pre-sampling co-located with the other pre-processing steps in `ai.ts`.

**Sample count = node width in pixels for functionGraph, configurable for parametricGraph**

Following the existing spec. For `parametricGraph`, default samples = 500 with optional override via `samples` field.

**Point clipping via `drawProgress` in the Rust renderer**

The renderer clips: `let count = (points.len() as f64 * draw_progress).floor() as usize`. Then it builds a Skia `Path` from the first `count` points and strokes it. This is the same pattern as the existing `drawProgress` behavior described in the graph-node-rendering spec.

**NaN/Infinity points are skipped, producing natural curve gaps**

Consistent with the spec: e.g., `1/x` at `x=0` produces a gap, not a crash.

**Axis drawing in Rust**

When `show_axes: true`, the renderer computes the pixel position of `y=0` (horizontal axis) and `x=0` (vertical axis) within the bounding box and draws two lines. Uses a muted version of the curve color (lower opacity).

## Risks / Trade-offs

- **Risk**: `points` array makes JSON payload large for wide graphs → **Mitigation**: 1920 points × 2 floats × 8 bytes = ~30KB max; trivial for a render request
- **Risk**: mathjs compilation errors from AI-generated expressions → **Mitigation**: `preComputeGraphNodes` wraps compilation in try-catch, throws `PRERENDER_ERROR` with the offending expression before the engine is called
- **Risk**: AI generates expressions that are syntactically valid mathjs but semantically wrong (e.g., wrong variable name) → **Mitigation**: catalog documents that `fn` must be an expression in `x`, `fnX`/`fnY` in `t`, with examples
- **Risk**: This PR depends on PR 1 (drawProgress fix) being merged → **Mitigation**: clearly documented; PRs should merge in order
