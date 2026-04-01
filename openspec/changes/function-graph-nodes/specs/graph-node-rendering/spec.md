## MODIFIED Requirements

### Requirement: Graph nodes are pre-sampled before the frame loop
The pre-sample phase SHALL be implemented on the TypeScript side (not in the Rust engine) as a `preComputeGraphNodes` function. It SHALL scan all scenes for `functionGraph` and `parametricGraph` nodes, compile their expressions using the `mathjs` library, sample points, map to pixel coordinates, skip NaN/Infinity values, and embed the resulting `points` arrays directly into the engine-facing node definitions. This step SHALL run exactly once, before the `renderVideo` call, as part of the `convertAiOutputToVideoDescription` pipeline. No expression evaluation SHALL occur in the Rust engine.

#### Scenario: FunctionGraph points are embedded before the engine receives the scene
- **WHEN** an AI output contains a functionGraph node with `fn: "sin(x)"` and `width: 600`
- **THEN** the engine-facing scene description contains that node with a `points` array of 600 `{x, y}` objects, and the `fn` field may be retained for reference or omitted

#### Scenario: NaN and Infinity values are skipped
- **WHEN** a functionGraph evaluates `fn: "1/x"` and a sample hits `x = 0`
- **THEN** the resulting point is excluded from the `points` array

### Requirement: Graph nodes draw animated curves from cached point arrays per frame
The per-frame draw path for graph nodes in the Rust renderer SHALL clip the `points` array to `floor(points.length * draw_progress)` points and stroke the resulting path. `functionGraph` nodes SHALL draw axis lines through the mapped origin when `show_axes` is `true`, and evenly spaced grid lines in a muted color when `show_grid` is `true`. No expression evaluation SHALL occur during the frame loop.

#### Scenario: drawProgress at 0.5 draws half the curve
- **WHEN** a functionGraph has 200 points and `draw_progress` resolves to `0.5` at the current frame
- **THEN** the draw path strokes only the first 100 points

#### Scenario: showAxes draws axis lines through the origin
- **WHEN** a functionGraph has `show_axes: true`, `xRange: [-5, 5]`, `yRange: [-5, 5]`
- **THEN** the draw path renders a horizontal line at `y=0` and a vertical line at `x=0`, both mapped to pixel coordinates within the bounding box
