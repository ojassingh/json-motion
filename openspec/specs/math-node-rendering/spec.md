# math-node-rendering Specification

## Purpose
TBD - created by archiving change add-math-and-graph-nodes. Update Purpose after archive.
## Requirements
### Requirement: Math nodes declare a LaTeX string with visual properties
The system SHALL accept a node with `type: "math"` that includes a required `latex` string (the LaTeX expression), required `fontSize` (positive number controlling scale), required `width` and `height` (bounding box dimensions), and an optional `color` (hex color, defaulting to `#f8fafc`). The node SHALL also accept all base transform properties (`x`, `y`, `opacity`, `rotate`, `scale`, `scaleX`, `scaleY`, `skewX`, `skewY`, `anchor`, `zIndex`, `primitives`) and an `animate` block supporting the base animatable properties.

#### Scenario: A valid math node is accepted
- **WHEN** a scene contains a node with `type: "math"`, `latex: "E = mc^2"`, `fontSize: 48`, `width: 400`, `height: 100`, and `color: "#ffffff"`
- **THEN** validation succeeds and the node is available to the pre-render and frame resolution pipeline

#### Scenario: A math node without required fields is rejected
- **WHEN** a scene contains a node with `type: "math"` but omits `latex`
- **THEN** validation rejects the request before rendering begins

### Requirement: Math nodes are pre-rendered to Skia images before the frame loop
The pre-render phase SHALL scan the entire scene tree for every node with `type: "math"`, collect all unique `(latex, color)` combinations, render each to a self-contained SVG string using MathJax's `tex2svg` Node.js adapter, load each SVG into a Skia image, and store the results in a `Map` keyed by `latex::color`. This pre-render step SHALL run exactly once before the first frame is rasterized.

#### Scenario: Duplicate LaTeX strings are rendered only once
- **WHEN** two math nodes in different scenes share the same `latex` and `color` values
- **THEN** the pre-render phase produces exactly one Skia image for that combination

#### Scenario: Same LaTeX with different colors produces separate cache entries
- **WHEN** two math nodes share `latex: "x^2"` but have colors `#ffffff` and `#ff0000`
- **THEN** the pre-render phase produces two separate Skia images, one per color

### Requirement: Math nodes draw from the pre-render cache per frame
The per-frame draw path for a math node SHALL look up the node's `(latex, color)` in the pre-render cache, retrieve the cached Skia image, and draw it at the resolved position and transform. The `fontSize` property SHALL act as a scale factor relative to the SVG's natural dimensions. No MathJax calls SHALL occur during the frame loop.

#### Scenario: A math node renders at the correct position and scale
- **WHEN** a math node has `x: 100`, `y: 200`, `fontSize: 64`, and the cached SVG has natural dimensions of 200x50
- **THEN** the draw path scales the image proportionally based on `fontSize` and draws it at canvas position (100, 200) after applying transforms

### Requirement: Invalid LaTeX expressions produce a clear pre-render error
The pre-render phase SHALL catch MathJax errors for invalid LaTeX and throw an error with code `PRERENDER_ERROR` that includes the offending LaTeX string in its message.

#### Scenario: Malformed LaTeX is caught before the frame loop
- **WHEN** a math node contains `latex: "\\frac{"`  (unclosed fraction)
- **THEN** the pre-render phase throws a `PRERENDER_ERROR` before any frame is rendered
