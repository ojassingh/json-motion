## Why

The current primitive set lacks two of the most fundamental geometric shapes needed for educational animations: **circles** and **lines**. Without circles, the AI cannot represent neurons in neural networks, atoms in chemistry, Venn diagrams, orbits, probability distributions, or any circular geometry. Without lines, it cannot draw vectors, rays, graph axes (manually), number lines, or connectors that aren't arrows. These two shapes cover a wide proportion of educational diagrams that currently fail or produce awkward workarounds (e.g., using a rect with `cornerRadius: 9999` for circles). Adding them unlocks a large category of scientific and mathematical content without requiring the axes/graph infrastructure of PR 5.

## What Changes

- Add `circle` node type: rendered as an Skia oval/circle, with `radius`, optional `fill`, `stroke`, `strokeWidth`. Supports all base transform and timeline properties
- Add `line` node type: rendered as an Skia line segment with `x1`, `y1`, `x2`, `y2` (absolute canvas coordinates), optional `stroke`, `strokeWidth`, optional `cap` (round/square/butt). Supports all base transform and timeline properties
- Add both to the TS Zod schema, engine Rust schema, renderer, animation resolver, and catalog
- `drawProgress` (fixed in PR 1) applies to both: a circle can draw itself as a stroke arc; a line can grow from one end

## Capabilities

### New Capabilities
- `circle-node`: A `type: "circle"` node rendered as a filled and/or stroked circle/ellipse using Skia
- `line-node`: A `type: "line"` node rendered as a styled line segment using Skia

### Modified Capabilities
_(none)_

## Impact

- **Rust engine**: `engine/src/schema.rs` (new node variants), `engine/src/animation/frame.rs` (new resolve functions), `engine/src/render.rs` (new draw functions), `engine/src/shared/types.rs` (new resolved types)
- **TypeScript**: `lib/video/schema.ts` (new Zod schemas), `lib/types/video.ts` (new types), `lib/ai/prompt-to-video-config.ts` (catalog entries)
- **No breaking changes** — new node types are additive; existing scenes unaffected
