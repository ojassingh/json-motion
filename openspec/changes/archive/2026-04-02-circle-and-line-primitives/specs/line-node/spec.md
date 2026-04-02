## ADDED Requirements

### Requirement: Line nodes declare start and end points with visual properties
The system SHALL accept a node with `type: "line"` that includes required `x1` and `y1` (start point, canvas coordinates relative to the node's layout position), required `x2` and `y2` (end point, canvas coordinates relative to the node's layout position), optional `stroke` (hex color, default `#f8fafc`), optional `strokeWidth` (positive number, default `2`), optional `cap` (enum: `"round"` | `"square"` | `"butt"`, default `"round"`), optional `drawProgress` (number 0–1, default `1`), and all base transform properties.

#### Scenario: A valid line node is accepted
- **WHEN** a scene contains a node with `type: "line"`, `x1: 0`, `y1: 0`, `x2: 200`, `y2: 0`, and `stroke: "#ffffff"`
- **THEN** schema validation succeeds

#### Scenario: A line node without required endpoint fields is rejected
- **WHEN** a node declares `type: "line"` but omits `x2`
- **THEN** schema validation rejects the node

### Requirement: The renderer draws line nodes using Skia
The Rust renderer SHALL draw a line node using Skia's `draw_line` API with the configured stroke paint (color, stroke width, line cap). The node's base layout position (`x`, `y`) SHALL be added as an offset to all four endpoint coordinates. When `drawProgress < 1`, the renderer SHALL draw only the segment from `(x1, y1)` to the point `lerp((x1,y1), (x2,y2), drawProgress)`.

#### Scenario: A line with drawProgress 1 renders the full segment
- **WHEN** a line node has `x1: 100`, `y1: 200`, `x2: 500`, `y2: 200`, `stroke: "#ffffff"`, and `drawProgress: 1`
- **THEN** the rendered frame contains a horizontal line from (100, 200) to (500, 200)

#### Scenario: A line with drawProgress 0.5 renders the first half
- **WHEN** a line node has `x1: 0`, `y1: 0`, `x2: 400`, `y2: 0` and `drawProgress: 0.5`
- **THEN** the rendered line ends at (200, 0) — the midpoint between start and end

### Requirement: Line nodes support timeline animations for drawProgress, stroke, strokeWidth, and position
The animation resolver SHALL support `opacity`, `x`, `y`, `dx`, `dy`, `scale`, `rotate`, `strokeWidth`, `drawProgress`, `stroke`, `x1`, `y1`, `x2`, `y2` as animatable properties for line nodes.

#### Scenario: Animating drawProgress from 0 to 1 produces a self-drawing line
- **WHEN** a line node has a timeline event `{ at: 0.5, dur: 1.0, drawProgress: 1, ease: "linear" }` and `drawProgress` starts at 0
- **THEN** at t=1.0s the rendered line is at 50% of its full length, growing toward (x2, y2)
