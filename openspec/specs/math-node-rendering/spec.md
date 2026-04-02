# math-node-rendering Specification

## Purpose
Define math node validation, pre-rendering, layout sizing, and frame rendering behavior.
## Requirements
### Requirement: Math nodes declare a LaTeX string with visual properties
The system SHALL accept a node with `type: "equation"` (replacing the previously proposed `type: "math"`) that includes a required `latex` string and optional `size` (positive number, controlling font size and scale, default 48) and optional `color` (hex color, default `#f8fafc`). The node SHALL accept all base transform properties. The node SHALL NOT accept `width` or `height` — rendered dimensions are derived from the MathJax output. The node is resolved on the TS side to a `VideoIconNode` before the Rust engine processes the scene.

#### Scenario: A valid equation node without size is accepted
- **WHEN** a scene contains a node with `type: "equation"`, `latex: "E = mc^2"`, and `color: "#ffffff"` but no `size`
- **THEN** validation succeeds, the default `size: 48` is applied, and the node is available to the resolution pipeline

#### Scenario: An equation node without the required latex field is rejected
- **WHEN** a scene contains a node with `type: "equation"` but omits `latex`
- **THEN** validation rejects the request before resolution begins

### Requirement: Math nodes are pre-rendered to Skia images before the frame loop
The pre-render phase SHALL scan the entire scene tree for every node with `type: "math"`, collect all unique `(latex, color)` combinations, render each to a self-contained SVG string using MathJax's `tex2svg` Node.js adapter, load each SVG into a Skia image, and store the results in a `Map` keyed by `latex::color`. This pre-render step SHALL run exactly once before the first frame is rasterized.

#### Scenario: Duplicate LaTeX strings are rendered only once
- **WHEN** two math nodes in different scenes share the same `latex` and `color` values
- **THEN** the pre-render phase produces exactly one Skia image for that combination

#### Scenario: Same LaTeX with different colors produces separate cache entries
- **WHEN** two math nodes share `latex: "x^2"` but have colors `#ffffff` and `#ff0000`
- **THEN** the pre-render phase produces two separate Skia images, one per color

### Requirement: Math node layout dimensions are derived from the pre-render cache
The layout system SHALL accept an optional `PreRenderCaches` parameter. When resolving the bounding box of a math node for layout, centering, stacking, or alignment, the system SHALL look up the node's `(latex, color)` key in the math image cache. If found, the layout dimensions SHALL be computed as `width = image.width * (fontSize / image.height)` and `height = fontSize`. If the cache is unavailable or the key is not found, the system SHALL fall back to declared `width` and `height` values if present, or `{ width: 0, height: 0 }` otherwise.

#### Scenario: A math node inside a center container is visually centered
- **WHEN** a math node with `latex: "\\sum_{i=1}^{n} f(x_i)\\,\\Delta x"` and `fontSize: 56` is the child of a `center` node in a 1280×720 canvas, and the pre-render cache contains the rendered image for that expression
- **THEN** the resolved layout positions the math node such that its visual center coincides with the canvas center (640, 360)

#### Scenario: Layout falls back gracefully without cache
- **WHEN** `resolveLayout` is called without a `PreRenderCaches` argument and a math node declares `width: 400` and `height: 80`
- **THEN** layout uses `{ width: 400, height: 80 }` for dimension calculations

### Requirement: Math nodes draw from the pre-render cache per frame
The per-frame draw path for a math node SHALL look up the node's `(latex, color)` in the pre-render cache, retrieve the cached Skia image, and draw it at the resolved position and transform. The `fontSize` property SHALL act as a scale factor relative to the SVG's natural dimensions. No MathJax calls SHALL occur during the frame loop.

#### Scenario: A math node renders at the correct position and scale
- **WHEN** a math node has `x: 100`, `y: 200`, `fontSize: 64`, and the cached SVG has natural dimensions of 200x50
- **THEN** the draw path scales the image proportionally based on `fontSize` and draws it at canvas position (100, 200) after applying transforms

### Requirement: Resolved math nodes carry actual rendered dimensions
The node resolution pipeline SHALL accept `PreRenderCaches` and use it when resolving math nodes. The resolved math node SHALL carry `width` and `height` values that reflect the actual rendered image dimensions derived from cache plus `fontSize`, so anchor correction and layout math use the rendered bounds instead of placeholder values.

#### Scenario: Resolved math node dimensions match renderer output
- **WHEN** a math node has `fontSize: 56` and the pre-rendered SVG image has natural dimensions of 350×88
- **THEN** the resolved node has `width = 350 * (56 / 88)` and `height = 56`, and the renderer draws the image at that scale

### Requirement: Invalid LaTeX expressions produce a clear pre-render error
The pre-render phase SHALL catch MathJax errors for invalid LaTeX and throw an error with code `PRERENDER_ERROR` that includes the offending LaTeX string in its message.

#### Scenario: Malformed LaTeX is caught before the frame loop
- **WHEN** a math node contains `latex: "\\frac{"`
- **THEN** the pre-render phase throws a `PRERENDER_ERROR` before any frame is rendered

