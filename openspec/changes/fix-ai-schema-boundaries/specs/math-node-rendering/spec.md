## MODIFIED Requirements

### Requirement: Math nodes declare a LaTeX string with visual properties
The system SHALL accept a node with `type: "math"` that includes a required `latex` string (the LaTeX expression), required `fontSize` (positive number controlling scale), optional `width` and `height` (bounding box hints, ignored when pre-render cache is available), and an optional `color` (hex color, defaulting to `#f8fafc`). The node SHALL also accept all base transform properties (`x`, `y`, `opacity`, `rotate`, `scale`, `scaleX`, `scaleY`, `skewX`, `skewY`, `anchor`, `zIndex`, `primitives`) and an `animate` block supporting the base animatable properties. When `width` and `height` are omitted and a pre-render cache is available, the rendered dimensions SHALL be derived from the cached image and `fontSize`.

#### Scenario: A valid math node without width and height is accepted
- **WHEN** a scene contains a node with `type: "math"`, `latex: "E = mc^2"`, `fontSize: 48`, and `color: "#ffffff"` but no `width` or `height`
- **THEN** validation succeeds and the node is available to the pre-render and frame resolution pipeline

#### Scenario: A math node without required fields is rejected
- **WHEN** a scene contains a node with `type: "math"` but omits `latex`
- **THEN** validation rejects the request before rendering begins

## ADDED Requirements

### Requirement: Math node layout dimensions are derived from the pre-render cache
The layout system SHALL accept an optional `PreRenderCaches` parameter. When resolving the bounding box of a math node for layout (centering, stacking, alignment), the system SHALL look up the node's `(latex, color)` key in the math images cache. If found, the layout dimensions SHALL be computed as `width = image.width * (fontSize / image.height)` and `height = fontSize`. If the cache is unavailable or the key is not found, the system SHALL fall back to declared `width`/`height` values if present, or `{width: 0, height: 0}` otherwise.

#### Scenario: A math node inside a center container is visually centered
- **WHEN** a math node with `latex: "\\sum_{i=1}^{n} f(x_i)\\,\\Delta x"` and `fontSize: 56` is the child of a `center` node in a 1280×720 canvas, and the pre-render cache contains the rendered image for that expression
- **THEN** the resolved layout positions the math node such that its visual center coincides with the canvas center (640, 360)

#### Scenario: Layout falls back gracefully without cache
- **WHEN** `resolveLayout` is called without a `PreRenderCaches` argument and a math node declares `width: 400` and `height: 80`
- **THEN** layout uses `{width: 400, height: 80}` for dimension calculations

### Requirement: Resolved math nodes carry actual rendered dimensions
The node resolution pipeline SHALL accept `PreRenderCaches` and use it when resolving math nodes. The `ResolvedMathNode` SHALL carry `width` and `height` values that reflect the actual rendered image dimensions (derived from cache + fontSize), so that `getAnchorOffset` in the renderer applies the correct anchor correction.

#### Scenario: Resolved math node dimensions match renderer output
- **WHEN** a math node has `fontSize: 56` and the pre-rendered SVG image has natural dimensions of 350×88
- **THEN** the resolved node has `width = 350 * (56/88) ≈ 222.7` and `height = 56`, and the renderer draws the image at that scale
