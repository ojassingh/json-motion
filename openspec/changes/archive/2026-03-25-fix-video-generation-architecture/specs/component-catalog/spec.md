## ADDED Requirements

### Requirement: The catalog declares all renderable node types with typed props and metadata
The system SHALL provide a `defineCatalog()` function that accepts a record of node type declarations, each containing a Zod prop schema, an optional `slots` array declaring child-accepting capabilities, and a `description` string. The catalog SHALL be the single source of truth for what node types the AI can generate. Every node type in the renderer's discriminated union SHALL have a corresponding catalog entry.

#### Scenario: A catalog with all current node types is defined
- **WHEN** `defineCatalog()` is called with entries for `group`, `rect`, `text`, `math`, `functionGraph`, and `parametricGraph`
- **THEN** the returned catalog object contains typed declarations for each node type with their prop schemas accessible programmatically

#### Scenario: A catalog entry for a node with children declares slots
- **WHEN** a catalog entry for `group` declares `slots: ["children"]`
- **THEN** the catalog indicates that `group` accepts child nodes, and this information is available for prompt generation

### Requirement: The catalog auto-generates a structured system prompt
The system SHALL provide a `catalog.toPrompt(options)` method that produces a system prompt string containing a component documentation section for each declared node type. Each section SHALL include the node type name, its description, its prop names and types (derived from the Zod schema), whether it accepts children, and which animation properties it supports. The prompt SHALL NOT contain information about node types or props that do not exist in the catalog.

#### Scenario: The generated prompt includes all catalog entries
- **WHEN** `catalog.toPrompt()` is called on a catalog with `rect`, `text`, and `stack` entries
- **THEN** the output string contains documentation sections for `rect`, `text`, and `stack` — and no other component types

#### Scenario: The generated prompt reflects Zod enum constraints
- **WHEN** a catalog entry has a prop defined as `z.enum(["vertical", "horizontal"])`
- **THEN** the generated prompt section for that prop lists the allowed values `"vertical"` and `"horizontal"`

#### Scenario: Adding a new node type to the catalog automatically updates the prompt
- **WHEN** a new node type `customShape` is added to the catalog definition
- **THEN** calling `catalog.toPrompt()` includes documentation for `customShape` without any manual prompt editing

### Requirement: The catalog provides schema extraction for structured output
The system SHALL provide a method to extract the combined Zod schema from the catalog for use with AI SDK structured output. The extracted schema SHALL be a valid `videoDescriptionSchema` that includes all node types declared in the catalog.

#### Scenario: The catalog schema is used for structured output generation
- **WHEN** the AI generation function uses the catalog's extracted schema with `Output.object()`
- **THEN** the AI provider receives a schema that matches the catalog's node type declarations
