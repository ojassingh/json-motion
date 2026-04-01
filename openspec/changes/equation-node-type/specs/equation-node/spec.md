## ADDED Requirements

### Requirement: The equation node accepts a latex string and visual properties
The system SHALL accept an AI-generated node with `type: "equation"` that includes a required `latex` string (a valid LaTeX expression, without surrounding `$$` delimiters), optional `size` (positive number, font size in pixels, default 48), and optional `color` (hex color, default `#f8fafc`). The node SHALL accept all base transform properties (`x`, `y`, `opacity`, `rotate`, `scale`, `scaleX`, `scaleY`, `skewX`, `skewY`, `zIndex`). The `equation` node SHALL NOT accept `width` or `height` — dimensions are derived from the MathJax render.

#### Scenario: A valid equation node is accepted by the AI schema
- **WHEN** an AI-generated node declares `type: "equation"`, `latex: "E = mc^2"`, and `size: 64`
- **THEN** `videoAiOutputSchema` parses it successfully

#### Scenario: An equation node without size uses the default
- **WHEN** an AI-generated node declares only `type: "equation"` and `latex: "\\frac{a}{b}"`
- **THEN** the system uses `size: 48` as the default and resolves correctly

#### Scenario: An equation node with width or height is rejected
- **WHEN** an AI-generated node includes `type: "equation"`, `latex: "x^2"`, and `width: 300`
- **THEN** `videoAiOutputSchema` rejects it

### Requirement: Equation nodes are resolved to icon nodes before reaching the Rust engine
The TS resolution pipeline SHALL convert every `equation` node to a `VideoIconNode` before the scene description is passed to the engine. The conversion SHALL call `latexToIcon(node.latex, { fontSize: node.size })`, map the resulting path elements to `VideoIconPrimitive[]`, and produce a `VideoIconNode` with `fill` set to the equation's `color` (or default), `strokeWidth: 0`, and dimensions from the MathJax render output. The Rust engine SHALL never receive a node with `type: "equation"`.

#### Scenario: An equation node is resolved to an icon node
- **WHEN** `resolveAiSceneNodes` processes a scene containing an equation node with `latex: "x^2 + y^2 = r^2"` and `size: 56`
- **THEN** the resolved scene contains an icon node with `elements` containing SVG path data, `fill: "#f8fafc"`, `strokeWidth: 0`, and non-zero `width` and `height`

#### Scenario: An invalid latex string throws a resolution error
- **WHEN** an equation node contains `latex: "\\frac{"` (malformed)
- **THEN** `resolveAiSceneNodes` throws an error before the scene is passed to the engine

### Requirement: The text node's dollar-sign math fallback is retained but deprecated in the prompt
The system SHALL continue to resolve `text` nodes whose `text` field matches `^\s*\$\$([\s\S]+)\$\$\s*$` to icon nodes for backward compatibility. The AI catalog description for `text` SHALL explicitly state that `$$...$$` is deprecated — the `equation` node MUST be used instead.

#### Scenario: An existing text node with dollar-sign math still renders
- **WHEN** a stored scene contains a text node with `text: "$$a^2 + b^2 = c^2$$"`
- **THEN** the resolution pipeline converts it to an icon node and renders it correctly without error
