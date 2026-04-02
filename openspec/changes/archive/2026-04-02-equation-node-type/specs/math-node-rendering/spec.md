## MODIFIED Requirements

### Requirement: Math nodes declare a LaTeX string with visual properties
The system SHALL accept a node with `type: "equation"` (replacing the previously proposed `type: "math"`) that includes a required `latex` string and optional `size` (positive number, controlling font size and scale, default 48) and optional `color` (hex color, default `#f8fafc`). The node SHALL accept all base transform properties. The node SHALL NOT accept `width` or `height` — rendered dimensions are derived from the MathJax output. The node is resolved on the TS side to a `VideoIconNode` before the Rust engine processes the scene.

#### Scenario: A valid equation node without size is accepted
- **WHEN** a scene contains a node with `type: "equation"`, `latex: "E = mc^2"`, and `color: "#ffffff"` but no `size`
- **THEN** validation succeeds, the default `size: 48` is applied, and the node is available to the resolution pipeline

#### Scenario: An equation node without the required latex field is rejected
- **WHEN** a scene contains a node with `type: "equation"` but omits `latex`
- **THEN** validation rejects the request before resolution begins
