# visual-validation Specification

## Purpose
Define non-blocking visual checks that catch obviously broken compositions before rendering.

## Requirements

### Requirement: Visual validation detects nodes that are entirely off-screen
The system SHALL check that every node with known dimensions (rect, image, math, functionGraph, parametricGraph) is not entirely outside the frame bounds at its initial state (frame 0 of its scene). A node is off-screen when its bounding box, computed from x, y, anchor, width, and height, does not intersect the frame rectangle (0, 0, frame_width, frame_height). Off-screen nodes SHALL produce a validation warning, not a hard error.

#### Scenario: A rect entirely to the right of the frame
- **WHEN** a 100×100 rect has `x: 1100` with `anchor: "top-left"` on a 960-wide frame
- **THEN** visual validation produces a warning indicating the node is off-screen

#### Scenario: A rect partially off-screen passes
- **WHEN** a 100×100 rect has `x: 900` with `anchor: "top-left"` on a 960-wide frame
- **THEN** visual validation does NOT produce an off-screen warning because 40px remain visible

### Requirement: Visual validation detects nodes with zero effective dimensions
The system SHALL check that nodes which require dimensions (rect, image, math, functionGraph, parametricGraph) have both width > 0 and height > 0 after resolving any initial-frame animations. A zero-dimension node SHALL produce a validation warning.

#### Scenario: A rect with zero width
- **WHEN** a rect declares `width: 0`
- **THEN** Zod schema validation rejects it via the positive-number requirement before visual validation runs

#### Scenario: A rect animating from zero width
- **WHEN** a rect has `width: 100` but `animate.width: { from: 0, to: 100, end: 30 }` and is checked at frame 0
- **THEN** visual validation produces a warning that the node has zero effective width at frame 0

### Requirement: Visual validation checks are run after schema validation and before rendering
The system SHALL execute visual validation checks after Zod schema parsing succeeds and before any frame rendering begins. Visual validation results SHALL be returned as an array of warning objects with `nodeId`, `message`, and `severity` fields. The rendering pipeline SHALL NOT be blocked by visual validation warnings.

#### Scenario: Visual validation runs on a valid schema
- **WHEN** a video description passes `videoDescriptionSchema.safeParse()` successfully
- **THEN** visual validation checks are run and produce zero or more warnings without throwing errors

#### Scenario: Visual validation does not block rendering
- **WHEN** visual validation produces warnings for off-screen nodes
- **THEN** the rendering pipeline proceeds and produces a video output
