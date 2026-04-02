## ADDED Requirements

### Requirement: FunctionGraph AI nodes declare a mathematical expression and range
The AI-facing schema SHALL accept a node with `type: "functionGraph"` that includes required `fn` (string, a mathjs-compatible expression in variable `x`), required `xRange` (tuple of two numbers `[min, max]`), required `yRange` (tuple of two numbers `[min, max]`), required `width` (positive number, bounding box width in pixels), required `height` (positive number, bounding box height in pixels), optional `color` (hex, default `#f8fafc`), optional `strokeWidth` (positive number, default `2`), optional `showAxes` (boolean, default `false`), optional `showGrid` (boolean, default `false`), optional `drawProgress` (number 0–1, default `1`), and all base transform properties. The `points` field SHALL NOT appear in the AI-facing schema — it is injected by the TS pre-sampling step.

#### Scenario: A valid functionGraph AI node is accepted
- **WHEN** an AI-generated node declares `type: "functionGraph"`, `fn: "sin(x)"`, `xRange: [-6.28, 6.28]`, `yRange: [-1.5, 1.5]`, `width: 600`, `height: 300`
- **THEN** `videoAiOutputSchema` parses it successfully

#### Scenario: A functionGraph node missing fn is rejected
- **WHEN** a node declares `type: "functionGraph"` but omits `fn`
- **THEN** schema validation rejects it

### Requirement: The TS pipeline pre-samples functionGraph nodes before sending to the Rust engine
The `preComputeGraphNodes` function SHALL scan all scenes for `functionGraph` nodes, compile each `fn` expression using mathjs, sample `width` evenly-spaced x values across `xRange`, evaluate `fn(x)` for each, map valid (x, y) pairs to pixel coordinates within the bounding box (y-axis flipped: lower y-values map to higher pixel y), skip NaN and Infinity values, and embed the resulting array as `points` on the engine-facing node. The engine-facing `functionGraph` node SHALL include `points` as a required field.

#### Scenario: FunctionGraph points map correctly to pixel coordinates
- **WHEN** a functionGraph has `fn: "x"`, `xRange: [0, 1]`, `yRange: [0, 1]`, `width: 100`, `height: 100`
- **THEN** the pre-sampling produces 100 points where x=0 maps to pixel (0, 100) and x=1 maps to pixel (100, 0)

#### Scenario: NaN values are excluded from the points array
- **WHEN** a functionGraph evaluates `fn: "1/x"` and one sample hits `x = 0`
- **THEN** that point is excluded from the array and the curve has a gap at that position

#### Scenario: An invalid expression throws PRERENDER_ERROR
- **WHEN** a functionGraph has `fn: "sin("`
- **THEN** `preComputeGraphNodes` throws an error with code `PRERENDER_ERROR` before the engine is called

### Requirement: The Rust renderer draws functionGraph nodes from pre-sampled points
The Rust renderer SHALL draw a functionGraph node by building a Skia `Path` from the first `floor(points.length * drawProgress)` points and stroking it. When `showAxes: true`, the renderer SHALL draw axis lines through the mapped y=0 (horizontal) and x=0 (vertical) positions using a muted stroke. When `showGrid: true`, the renderer SHALL draw evenly-spaced horizontal and vertical lines across the bounding box in a muted color.

#### Scenario: drawProgress 0.5 strokes half the points
- **WHEN** a functionGraph has 600 pre-sampled points and `drawProgress: 0.5`
- **THEN** the renderer strokes a path from the first 300 points only

#### Scenario: showAxes draws the y=0 axis line
- **WHEN** a functionGraph has `xRange: [-5, 5]`, `yRange: [-2, 2]`, `showAxes: true`
- **THEN** the renderer draws a horizontal line at the pixel position corresponding to y=0 and a vertical line at x=0
