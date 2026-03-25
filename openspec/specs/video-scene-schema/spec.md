# video-scene-schema Specification

## Purpose
Define the validated shape and animation rules for video descriptions accepted by the renderer.
## Requirements

### Requirement: Video descriptions declare deterministic output metadata and scene timing
The system SHALL accept a video description object that includes output metadata (`width`, `height`, and `fps`) plus an ordered list of scenes, and each scene SHALL declare explicit `startFrame` and `duration` fields. Scene backgrounds SHALL accept either a static hex color, one animation object, or an array of animation objects that resolve against the containing scene timeline.

#### Scenario: Valid sequential scenes are accepted
- **WHEN** a render request includes video metadata and two scenes with explicit frame ranges in ascending order using `startFrame` and `duration`
- **THEN** the request validates successfully and the renderer receives deterministic timing information for both scenes

### Requirement: Nodes define explicit transforms and deterministic defaults
The system SHALL allow each node to declare base transform and visual properties directly on the node, and the following properties SHALL accept either a static value or an animation object: `opacity`, `rotate`, `scale`, `scaleX`, `scaleY`, `skewX`, `skewY`, `x`, `y`, `fill`, `stroke`, `strokeWidth`, `cornerRadius`, `width`, `height`, `color`, and `size`. Nodes SHALL use a single semantic `anchor` value instead of pixel anchor coordinates, `x` and `y` SHALL replace nested position data, and omitted optional properties SHALL resolve to documented defaults, including `anchor: "center"` when omitted.

#### Scenario: Optional transform fields fall back to defaults
- **WHEN** a `rect` node omits `rotate`, `skewX`, `skewY`, `opacity`, and `anchor`
- **THEN** validation succeeds and the renderer resolves those fields to documented default values instead of leaving them undefined

### Requirement: Nodes support declarative animations with explicit frame windows
The system SHALL allow each node to declare one optional `animate` object keyed by animatable property name. Each property value SHALL accept an object with `from`, `to`, and `end` fields plus optional `start` and `easing` fields, or an array of those objects for multi-step motion; omitted `start` SHALL default to `0`, omitted easing SHALL default to `ease-out`, and every animation window SHALL fit within the containing scene duration. Animation time values SHALL accept non-negative frame numbers or strings ending in `s`, and nodes MAY also declare a `primitives` array containing only `FadeIn`, `FadeOut`, `SlideIn`, `ScaleIn`, `Pop`, and `Wiggle`.

#### Scenario: A multi-step animation validates within scene bounds
- **WHEN** a `text` node declares `animate.fill` as two animation objects and `animate.opacity` as `{ "from": 0, "to": 1, "end": "0.5s" }` inside a 60-frame scene
- **THEN** the request validates successfully and the animation data is available to the frame resolver

### Requirement: Invalid scene descriptions are rejected before rendering
The system SHALL reject render requests that contain unsupported node types, duplicate node ids within a scene, missing required node fields, malformed animation objects, unsupported easing names, legacy `animations` or `animationPrimitives` arrays, pixel anchor fields, nested `position` objects, or animation ranges that extend beyond the containing scene duration. The set of supported node types SHALL be `group`, `rect`, `text`, `image`, `math`, `functionGraph`, and `parametricGraph`.

#### Scenario: Unsupported node types fail validation
- **WHEN** a render request contains a node with type `chart`
- **THEN** the API rejects the request before any frame rendering or encoding begins

#### Scenario: The new node types pass validation with required fields
- **WHEN** a render request contains valid `math`, `functionGraph`, and `parametricGraph` nodes with all required fields
- **THEN** the request validates successfully

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
