# graph-node-rendering Specification

## Purpose
TBD - created by archiving change add-math-and-graph-nodes. Update Purpose after archive.
## Requirements
### Requirement: FunctionGraph nodes declare a mathematical function with range and visual properties
The system SHALL accept a node with `type: "functionGraph"` that includes a required `fn` string (a mathjs-compatible expression in terms of `x`), required `xRange` (array of two numbers `[min, max]`), required `yRange` (array of two numbers `[min, max]`), required `width` and `height` (bounding box in pixels), optional `color` (hex, default `#f8fafc`), optional `strokeWidth` (positive number, default `2`), optional `showAxes` (boolean, default `false`), optional `showGrid` (boolean, default `false`), and optional `drawProgress` (number 0-1, default `1`). The node SHALL accept all base transform properties and an `animate` block supporting base properties plus `drawProgress` and `color`.

#### Scenario: A valid functionGraph node is accepted
- **WHEN** a scene contains a node with `type: "functionGraph"`, `fn: "sin(x)"`, `xRange: [-6.28, 6.28]`, `yRange: [-1.5, 1.5]`, `width: 600`, `height: 300`
- **THEN** validation succeeds and the node is available to the pre-sample and frame resolution pipeline

#### Scenario: A functionGraph with an animate block for drawProgress is accepted
- **WHEN** a functionGraph node includes `animate: { drawProgress: { from: 0, to: 1, end: 60 } }`
- **THEN** validation succeeds and the animation is resolved per frame

### Requirement: ParametricGraph nodes declare paired parametric functions with range and visual properties
The system SHALL accept a node with `type: "parametricGraph"` that includes required `fnX` and `fnY` strings (mathjs-compatible expressions in terms of `t`), required `tRange` (array of two numbers `[min, max]`), required `width` and `height` (bounding box in pixels), optional `color` (hex, default `#f8fafc`), optional `strokeWidth` (positive number, default `2`), optional `drawProgress` (number 0-1, default `1`), and optional `samples` (positive integer, default `500`). The node SHALL accept all base transform properties and an `animate` block supporting base properties plus `drawProgress` and `color`.

#### Scenario: A valid parametricGraph node is accepted
- **WHEN** a scene contains a node with `type: "parametricGraph"`, `fnX: "cos(t)"`, `fnY: "sin(t)"`, `tRange: [0, 6.28]`, `width: 400`, `height: 400`
- **THEN** validation succeeds and the node is available to the pre-sample and frame resolution pipeline

### Requirement: Graph nodes are pre-sampled before the frame loop
The pre-sample phase SHALL scan the scene tree for `functionGraph` and `parametricGraph` nodes, compile their expressions using mathjs, sample points across their respective ranges, map sampled values to pixel coordinates within the node's bounding box, and store the resulting pixel point arrays in a cache keyed by node ID. For `functionGraph`, the sample count SHALL equal the node's `width` in pixels. For `parametricGraph`, the sample count SHALL equal the node's `samples` property (default 500). This step SHALL run exactly once before the first frame is rasterized.

#### Scenario: FunctionGraph points map to pixel coordinates
- **WHEN** a functionGraph has `fn: "x"`, `xRange: [0, 1]`, `yRange: [0, 1]`, `width: 100`, `height: 100`
- **THEN** the pre-sample phase produces 100 pixel points mapping the identity function to the bounding box, with point (0,0) mapping to pixel (0, 100) and point (1,1) mapping to pixel (100, 0)

#### Scenario: NaN and Infinity values are skipped
- **WHEN** a functionGraph evaluates `fn: "1/x"` and a sample hits `x = 0`
- **THEN** the resulting point is skipped (not included in the pixel array), producing a gap in the curve

### Requirement: Graph nodes draw animated curves from cached point arrays per frame
The per-frame draw path for graph nodes SHALL resolve `drawProgress` from the animate block (default `1`), clip the cached pixel point array to `Math.floor(points.length * drawProgress)` points, and stroke the resulting path. `functionGraph` nodes SHALL additionally draw x-axis and y-axis lines through the mapped origin when `showAxes` is `true`, and evenly spaced grid lines in a muted color when `showGrid` is `true`. No mathjs calls SHALL occur during the frame loop.

#### Scenario: drawProgress at 0.5 draws half the curve
- **WHEN** a functionGraph has 200 cached points and `drawProgress` resolves to `0.5` at the current frame
- **THEN** the draw path strokes only the first 100 points

#### Scenario: showAxes draws axis lines through the origin
- **WHEN** a functionGraph has `showAxes: true`, `xRange: [-5, 5]`, `yRange: [-5, 5]`
- **THEN** the draw path renders a horizontal line at `y=0` and a vertical line at `x=0`, both mapped to pixel coordinates within the bounding box

### Requirement: Invalid math expressions produce a clear pre-render error
The pre-sample phase SHALL catch mathjs compilation or evaluation errors and throw an error with code `PRERENDER_ERROR` that includes the offending expression string in its message.

#### Scenario: An invalid function expression is caught before the frame loop
- **WHEN** a functionGraph contains `fn: "sin("`
- **THEN** the pre-sample phase throws a `PRERENDER_ERROR` before any frame is rendered
