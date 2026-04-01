## Why

Function graphs are the backbone of STEM education. Without them, the system cannot animate any of the most common educational concepts: plotting sin/cos waves for physics, showing f(x) = x² for algebra, visualizing a Gaussian distribution for statistics, drawing a trajectory parabola for mechanics, or showing a sigmoid curve for machine learning. Every subject from calculus to quantum mechanics to neural networks requires the ability to plot functions. This is the single highest-leverage primitive addition for educational animation coverage.

The prior `add-math-and-graph-nodes` archived change specced this for a now-obsolete Node.js renderer. This change implements it correctly for the current Rust + Skia architecture, where function evaluation happens on the TS side (using mathjs) and the engine receives pre-computed pixel points to stroke.

## What Changes

- Add `functionGraph` node type: plots `y = f(x)` given `fn` (mathjs expression in `x`), `xRange`, `yRange`, `width`, `height`. Supports `showAxes`, `showGrid`, `drawProgress`
- Add `parametricGraph` node type: plots `(fnX(t), fnY(t))` given `fnX`, `fnY`, `tRange`, `width`, `height`. Supports `drawProgress`
- **TS pre-sampling**: before the scene is sent to the Rust engine, a new `preComputeGraphNodes` step evaluates all function/parametric expressions using mathjs and embeds the resulting pixel point arrays in the node definitions (as a new `points` field)
- **Rust renderer**: receives nodes with pre-computed `points` arrays, clips to `drawProgress`, and strokes the path using Skia
- **Axes**: when `showAxes: true`, the Rust renderer draws x and y axis lines through the mapped origin; when `showGrid: true`, draws evenly-spaced grid lines in a muted color
- `drawProgress` is already unblocked by PR 1

## Capabilities

### New Capabilities
- `function-graph-node`: A `type: "functionGraph"` node that plots y=f(x) with optional axes and grid
- `parametric-graph-node`: A `type: "parametricGraph"` node that plots (fnX(t), fnY(t)) parametric curves

### Modified Capabilities
- `graph-node-rendering`: Updates the existing spec to reflect the Rust + TS pre-sampling architecture

## Impact

- **New TS file**: `lib/video/graph.ts` — mathjs expression evaluation and point pre-sampling
- **Rust engine**: `engine/src/schema.rs`, `engine/src/animation/frame.rs`, `engine/src/render.rs`, `engine/src/shared/types.rs`
- **TypeScript**: `lib/video/schema.ts`, `lib/types/video.ts`, `lib/actions/ai.ts` (pre-sampling step before render call), `lib/ai/prompt-to-video-config.ts`
- **New dependency**: `mathjs` (Node.js, for expression evaluation on TS side)
- **Depends on**: PR 1 (drawProgress fix in Rust `frame.rs`)
