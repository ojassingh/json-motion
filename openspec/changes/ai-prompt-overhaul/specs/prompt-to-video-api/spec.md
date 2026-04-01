## MODIFIED Requirements

### Requirement: The AI system prompt documents all supported node types and their properties
The system prompt SHALL be auto-generated from the component catalog via `catalog.toPrompt()` rather than hand-written. The generated prompt SHALL list all supported node types. For each node type, the prompt SHALL include the type name, an educationally-opinionated description explaining intended use cases, required and optional props with types and constraints, whether the node accepts children, and which animation properties it supports. The prompt SHALL include: a layout guidance section, a canvas coordinate system section, a `## Scene Recipes` section with at least 5 named patterns, and an `## Anti-Patterns` section. Catalog node descriptions SHALL be opinionated about use cases, not merely syntactic.

#### Scenario: The system prompt contains a Scene Recipes section
- **WHEN** the system prompt is generated from the catalog
- **THEN** the output contains a `## Scene Recipes` section with named all-caps patterns (e.g. LABELED_DIAGRAM, STEP_BY_STEP_REVEAL)

#### Scenario: The system prompt contains an Anti-Patterns section
- **WHEN** the system prompt is generated from the catalog
- **THEN** the output contains an `## Anti-Patterns` section explicitly prohibiting icon nodes for domain concepts

#### Scenario: The generated prompt reflects Zod enum constraints
- **WHEN** the catalog declares `direction` as `z.enum(["vertical", "horizontal"])` for the `stack` node
- **THEN** the generated prompt for `stack` lists `direction` with allowed values `"vertical"` and `"horizontal"`
