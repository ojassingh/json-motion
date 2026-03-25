## MODIFIED Requirements

### Requirement: Invalid scene descriptions are rejected before rendering
The system SHALL reject render requests that contain unsupported node types, duplicate node ids within a scene, missing required node fields, malformed animation objects, unsupported easing names, legacy `animations` or `animationPrimitives` arrays, pixel anchor fields, nested `position` objects, or animation ranges that extend beyond the containing scene duration. The set of supported node types SHALL be `group`, `rect`, `text`, `image`, `math`, `functionGraph`, and `parametricGraph`.

#### Scenario: Unsupported node types fail validation
- **WHEN** a render request contains a node with type `chart`
- **THEN** the API rejects the request before any frame rendering or encoding begins

#### Scenario: The new node types pass validation with required fields
- **WHEN** a render request contains valid `math`, `functionGraph`, and `parametricGraph` nodes with all required fields
- **THEN** the request validates successfully

## ADDED Requirements

### Requirement: The node discriminated union includes math, functionGraph, and parametricGraph types
The `videoNodeSchema` discriminated union SHALL include `math`, `functionGraph`, and `parametricGraph` alongside the existing `group`, `rect`, `text`, and `image` types. Each new type SHALL declare its own required and optional fields and its own animate schema that extends the base animate schema with type-specific animatable properties.

#### Scenario: A math node with all fields passes schema validation
- **WHEN** a node declares `type: "math"`, `id`, `latex`, `fontSize`, `width`, `height`, and optional `color`
- **THEN** the Zod schema parses it successfully

#### Scenario: A functionGraph node with animate block passes schema validation
- **WHEN** a node declares `type: "functionGraph"`, `id`, `fn`, `xRange`, `yRange`, `width`, `height`, and `animate: { drawProgress: { from: 0, to: 1, end: 30 } }`
- **THEN** the Zod schema parses it successfully

#### Scenario: A parametricGraph node passes schema validation
- **WHEN** a node declares `type: "parametricGraph"`, `id`, `fnX`, `fnY`, `tRange`, `width`, `height`
- **THEN** the Zod schema parses it successfully
