## MODIFIED Requirements

### Requirement: Nodes define explicit transforms and deterministic defaults
The system SHALL allow each node to declare base transform and visual properties directly on the node, and the following properties SHALL accept either a static value or an animation object: `opacity`, `rotate`, `scale`, `scaleX`, `scaleY`, `skewX`, `skewY`, `x`, `y`, `fill`, `stroke`, `strokeWidth`, `cornerRadius`, `width`, `height`, `color`, and `size`. Nodes SHALL use a single semantic `anchor` value instead of pixel anchor coordinates, `x` and `y` SHALL replace nested position data, and omitted optional properties SHALL resolve to documented defaults, including `anchor: "center"` when omitted. Text nodes SHALL have their effective width computed by the renderer via text measurement when `maxWidth` is not provided, ensuring that anchor-based positioning (especially `anchor: "center"`) works correctly for text regardless of whether `maxWidth` is specified.

#### Scenario: Optional transform fields fall back to defaults
- **WHEN** a `rect` node omits `rotate`, `skewX`, `skewY`, `opacity`, and `anchor`
- **THEN** validation succeeds and the renderer resolves those fields to documented default values instead of leaving them undefined

#### Scenario: Text node with anchor center and no maxWidth is centered correctly
- **WHEN** a `text` node has `anchor: "center"`, `x: 480`, `y: 270`, `text: "Hello"`, and no `maxWidth`
- **THEN** the renderer measures the text width and uses it for anchor offset computation, placing the text visually centered at (480, 270)

### Requirement: The node discriminated union includes layout node types alongside existing types
The `videoNodeSchema` discriminated union SHALL include `center`, `stack`, and `align` layout node types alongside the existing `group`, `rect`, `text`, `image`, `math`, `functionGraph`, and `parametricGraph` types. Each layout type SHALL declare its own required and optional fields. Layout nodes SHALL be valid children of `group` nodes and valid root-level scene nodes.

#### Scenario: A stack node passes schema validation
- **WHEN** a node declares `type: "stack"`, `id`, `direction: "vertical"`, `gap: 16`, and `children` array
- **THEN** the Zod schema parses it successfully

#### Scenario: A center node passes schema validation
- **WHEN** a node declares `type: "center"`, `id`, and a single-element `children` array
- **THEN** the Zod schema parses it successfully

#### Scenario: An align node passes schema validation
- **WHEN** a node declares `type: "align"`, `id`, `position: "top-center"`, `padding: 40`, and a single-element `children` array
- **THEN** the Zod schema parses it successfully

#### Scenario: Layout nodes are valid inside groups
- **WHEN** a `group` node contains a `center` child which contains a `rect`
- **THEN** the schema validates the nested structure successfully

## ADDED Requirements

### Requirement: Invalid scene descriptions reject invalid layout node configurations
The system SHALL reject render requests that contain `center` or `align` nodes with more than one child, `stack` nodes with invalid `direction` values, or `align` nodes with invalid `position` values. The schema SHALL enforce these constraints via Zod validation.

#### Scenario: A center node with multiple children fails validation
- **WHEN** a `center` node declares a `children` array with two elements
- **THEN** Zod schema validation rejects the request

#### Scenario: A stack with invalid direction fails validation
- **WHEN** a `stack` node declares `direction: "diagonal"`
- **THEN** Zod schema validation rejects the request
