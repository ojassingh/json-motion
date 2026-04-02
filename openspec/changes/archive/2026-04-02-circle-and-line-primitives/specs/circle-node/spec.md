## ADDED Requirements

### Requirement: Circle nodes declare a radius and visual properties
The system SHALL accept a node with `type: "circle"` that includes a required `radius` (positive number in pixels), optional `fill` (hex color), optional `stroke` (hex color), optional `strokeWidth` (positive number, default `2`), optional `drawProgress` (number 0–1, default `1`), and all base transform properties (`x`, `y`, `opacity`, `rotate`, `scale`, `scaleX`, `scaleY`, `skewX`, `skewY`, `zIndex`). At least one of `fill` or `stroke` SHOULD be provided for the circle to be visible.

#### Scenario: A valid circle node with fill is accepted
- **WHEN** a scene contains a node with `type: "circle"`, `radius: 80`, and `fill: "#3b82f6"`
- **THEN** schema validation succeeds and the node is available to the animation resolver and renderer

#### Scenario: A valid circle node with only stroke is accepted
- **WHEN** a scene contains a node with `type: "circle"`, `radius: 60`, `stroke: "#f8fafc"`, and `strokeWidth: 3`
- **THEN** schema validation succeeds

### Requirement: The renderer draws circle nodes using Skia
The Rust renderer SHALL draw a circle node by computing a bounding rect of `[x - radius, y - radius, x + radius, y + radius]` and calling `canvas.draw_oval()` with the resolved fill and stroke paints. When `drawProgress < 1`, the renderer SHALL draw an arc sweeping clockwise from 270° (12 o'clock) by `360 * drawProgress` degrees using Skia's arc drawing API instead of a full oval.

#### Scenario: A circle with drawProgress 1 renders a complete circle
- **WHEN** a circle node has `radius: 50`, `fill: "#ff0000"`, and `drawProgress: 1`
- **THEN** the rendered frame contains a fully filled circle at the resolved position

#### Scenario: A circle with drawProgress 0.5 renders a half arc
- **WHEN** a circle node has `radius: 50`, `stroke: "#ffffff"`, `strokeWidth: 4`, and `drawProgress: 0.5`
- **THEN** the rendered frame contains a 180° clockwise arc starting from the top of the circle

### Requirement: Circle nodes participate in layout as children of stack, center, and align
The layout system SHALL compute the bounding box of a circle node as `width = 2 * radius` and `height = 2 * radius` for the purposes of `center`, `stack`, and `align` layout. The layout-resolved `x` and `y` SHALL be the center of the circle.

#### Scenario: A circle centered inside a center node is visually centered
- **WHEN** a circle node with `radius: 40` is the child of a `center` node on a 1920×1080 canvas
- **THEN** the rendered center of the circle is at approximately (960, 540)

### Requirement: The circle node supports timeline animations for all base properties plus drawProgress and fill
The animation resolver SHALL support `opacity`, `x`, `y`, `dx`, `dy`, `scale`, `scaleX`, `scaleY`, `rotate`, `skewX`, `skewY`, `radius`, `strokeWidth`, `drawProgress`, `fill`, and `stroke` as animatable properties for circle nodes.

#### Scenario: Animating drawProgress from 0 to 1 produces a self-drawing circle
- **WHEN** a circle node has a timeline event `{ at: 0, dur: 1.5, drawProgress: 1, ease: "ease-out" }` starting from an initial `drawProgress: 0`
- **THEN** at t=0.75s the resolved `drawProgress` is approximately 0.75, and the renderer draws a 270° arc
