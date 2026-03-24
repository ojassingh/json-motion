# video-scene-schema Specification

## Purpose
TBD - created by archiving change add-deterministic-video-engine. Update Purpose after archive.
## Requirements
### Requirement: Video descriptions declare deterministic output metadata and scene timing
The system SHALL accept a video description object that includes output metadata (`width`, `height`, and `fps`) plus an ordered list of scenes, and each scene SHALL declare an explicit `startFrame` and `durationInFrames`.

#### Scenario: Valid sequential scenes are accepted
- **WHEN** a render request includes video metadata and two scenes with explicit frame ranges in ascending order
- **THEN** the request validates successfully and the renderer receives deterministic timing information for both scenes

### Requirement: Scenes use a discriminated scene graph with stable node identifiers
The system SHALL model each scene as a tree of nodes where every node has a stable `id` and a discriminated `type`, and the first implementation SHALL support `group`, `rect`, `text`, and `image` node types.

#### Scenario: Nested group nodes validate successfully
- **WHEN** a scene contains a `group` node with nested `rect` and `text` children that each have unique ids
- **THEN** the request validates successfully as a supported scene graph

### Requirement: Nodes define explicit transforms and deterministic defaults
The system SHALL allow each node to declare base transform values for position, anchor, scale, rotation, skew, opacity, and `zIndex`, and SHALL apply documented defaults for any omitted optional transform fields.

#### Scenario: Optional transform fields fall back to defaults
- **WHEN** a `rect` node omits `rotation`, `skew`, and `opacity`
- **THEN** validation succeeds and the renderer resolves those fields to default values instead of leaving them undefined

### Requirement: Nodes support declarative animations with explicit frame windows
The system SHALL allow nodes to declare keyframe animations and named animation effects, and every animation SHALL define an explicit frame window that fits within the containing scene duration.

#### Scenario: A named enter effect validates within scene bounds
- **WHEN** a `text` node declares a `fade-in` effect from frame 0 through frame 12 inside a 60-frame scene
- **THEN** the request validates successfully and the animation is available to the frame resolver

### Requirement: Invalid scene descriptions are rejected before rendering
The system SHALL reject render requests that contain unsupported node types, duplicate node ids within a scene, missing required node fields, or animation ranges that extend beyond the scene duration.

#### Scenario: Unsupported node types fail validation
- **WHEN** a render request contains a node with type `chart` in the initial implementation
- **THEN** the API rejects the request before any frame rendering or encoding begins

