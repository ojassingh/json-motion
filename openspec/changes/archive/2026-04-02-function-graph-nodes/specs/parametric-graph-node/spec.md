## ADDED Requirements

### Requirement: ParametricGraph AI nodes declare paired functions and a parameter range
The AI-facing schema SHALL accept a node with `type: "parametricGraph"` that includes required `fnX` (string, mathjs expression in variable `t`), required `fnY` (string, mathjs expression in variable `t`), required `tRange` (tuple of two numbers `[min, max]`), required `width` and `height` (positive numbers, bounding box in pixels), optional `color` (hex, default `#f8fafc`), optional `strokeWidth` (positive number, default `2`), optional `drawProgress` (number 0–1, default `1`), and optional `samples` (positive integer, default `500`). All base transform properties are accepted. The `points` field SHALL NOT appear in the AI-facing schema.

#### Scenario: A valid parametricGraph node for a circle is accepted
- **WHEN** an AI-generated node declares `type: "parametricGraph"`, `fnX: "cos(t)"`, `fnY: "sin(t)"`, `tRange: [0, 6.28]`, `width: 400`, `height: 400`
- **THEN** `videoAiOutputSchema` parses it successfully

### Requirement: The TS pipeline pre-samples parametricGraph nodes before sending to the engine
The `preComputeGraphNodes` function SHALL handle `parametricGraph` nodes by sampling `samples` evenly-spaced `t` values across `tRange`, evaluating `fnX(t)` and `fnY(t)` for each, mapping valid pairs to pixel coordinates centered in the bounding box (auto-scaling to fit), skipping NaN/Infinity pairs, and embedding the result as `points`.

#### Scenario: A parametric circle produces a closed circular point array
- **WHEN** a parametricGraph has `fnX: "cos(t)"`, `fnY: "sin(t)"`, `tRange: [0, 6.28]`, `samples: 100`, `width: 200`, `height: 200`
- **THEN** the pre-sampling produces approximately 100 points forming a circle centered in the 200×200 bounding box

### Requirement: The Rust renderer draws parametricGraph nodes from pre-sampled points
The Rust renderer SHALL draw a parametricGraph node identically to a functionGraph node: build a Skia `Path` from the first `floor(points.length * drawProgress)` points and stroke it. No axis or grid drawing is performed for parametric graphs.

#### Scenario: A parametricGraph with drawProgress 1 renders the full curve
- **WHEN** a parametricGraph has 500 pre-sampled points and `drawProgress: 1`
- **THEN** the renderer strokes all 500 points as a continuous path
