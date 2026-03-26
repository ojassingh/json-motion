## MODIFIED Requirements

### Requirement: The catalog auto-generates a structured system prompt
The system SHALL provide a `catalog.toPrompt(options)` method that produces a system prompt string containing a component documentation section for each declared node type. Each section SHALL include the node type name, its description, its prop names and types (derived from the Zod schema), whether it accepts children, and which animation properties it supports. The prompt SHALL NOT contain information about node types or props that do not exist in the catalog.

The keyframe guidance section of the generated prompt SHALL explicitly state that `x` and `y` keyframe values are canvas-absolute coordinates (origin 0,0 at top-left; positive x goes right, positive y goes down). The prompt SHALL include a concrete annotated example demonstrating the "start centered, animate to a corner" pattern using canvas-absolute target coordinates. The prompt SHALL NOT include examples that use large negative `x`/`y` values without explanation, as these imply a center-origin coordinate system that does not match the renderer.

#### Scenario: The generated prompt includes all catalog entries
- **WHEN** `catalog.toPrompt()` is called on a catalog with `rect`, `text`, and `stack` entries
- **THEN** the output string contains documentation sections for `rect`, `text`, and `stack` and no other component types

#### Scenario: The generated prompt reflects Zod enum constraints
- **WHEN** a catalog entry has a prop defined as `z.enum(["vertical", "horizontal"])`
- **THEN** the generated prompt section for that prop lists the allowed values `"vertical"` and `"horizontal"`

#### Scenario: Adding a new node type to the catalog automatically updates the prompt
- **WHEN** a new node type `customShape` is added to the catalog definition
- **THEN** calling `catalog.toPrompt()` includes documentation for `customShape` without any manual prompt editing

#### Scenario: The keyframe section states the canvas coordinate system
- **WHEN** `catalog.toPrompt()` is called
- **THEN** the output contains a statement that keyframe `x`/`y` are canvas-absolute coordinates with 0,0 at the top-left

#### Scenario: The keyframe example uses non-negative target coordinates for on-screen positions
- **WHEN** `catalog.toPrompt()` is called
- **THEN** the keyframe example in the output uses positive `x`/`y` target values that correspond to valid on-screen canvas positions
