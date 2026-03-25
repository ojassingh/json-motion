# prompt-to-video-api Specification

## Purpose
Define the AI generation contract for prompt-to-video so provider output, prompt guidance, and engine validation stay aligned.

## Requirements

### Requirement: Prompt generation produces a schema-valid video description
The prompt-to-video endpoint SHALL use AI SDK structured output bound to `videoAiOutputSchema` (not `videoDescriptionSchema`) to generate AI output. The generation pipeline SHALL then convert the AI output to a `VideoDescription` by parsing seconds durations to frame counts, computing `startFrame` for each scene, and injecting canvas metadata (`fps`, `width`, `height`) before validating against `videoDescriptionSchema`.

#### Scenario: Structured output schema is accepted by the provider path
- **WHEN** the prompt generation module serializes `videoAiOutputSchema` for structured output
- **THEN** the provider-facing schema is accepted and the generation pipeline produces a valid AI output object

#### Scenario: AI output with seconds duration is correctly converted to engine format
- **WHEN** the AI produces a scene with `duration: "3s"` and the canvas fps is 60
- **THEN** `generateSceneJson` produces an engine description with that scene having `duration: 180` and `startFrame` correctly computed

### Requirement: The AI system prompt documents all supported node types and their properties
The system prompt SHALL be auto-generated from the component catalog via `catalog.toPrompt()` rather than hand-written. The generated prompt SHALL list all supported node types including layout primitives (`center`, `stack`, `align`) alongside `group`, `rect`, `text`, `math`, `functionGraph`, and `parametricGraph`. For each node type, the prompt SHALL include the type name, description, required and optional props with their types and constraints (derived from the catalog's Zod schemas), whether the node accepts children, and which animation properties it supports. The prompt SHALL include a layout guidance section that instructs the model to prefer layout primitives over raw pixel coordinates for common composition patterns.

#### Scenario: The system prompt includes layout primitive documentation
- **WHEN** the system prompt is generated from the catalog
- **THEN** it contains documentation for `center`, `stack`, and `align` node types with their props and usage guidance

#### Scenario: The system prompt reflects actual schema constraints
- **WHEN** the catalog declares `direction` as `z.enum(["vertical", "horizontal"])` for the `stack` node
- **THEN** the generated prompt for `stack` lists `direction` with allowed values `"vertical"` and `"horizontal"`

#### Scenario: The prompt does not contain information about non-existent types
- **WHEN** the catalog does not include a `chart` node type
- **THEN** the generated prompt contains no mention of `chart` as a valid node type

### Requirement: The system prompt instructs the model to use layout primitives for common patterns
The system prompt SHALL include guidance that instructs the model to use `center` when an element should be in the middle of the frame, `stack` for sequences of elements, and `align` for edge-positioned elements like titles. The prompt SHALL instruct the model to use raw `x`/`y` coordinates only when precise pixel positioning is explicitly needed. The prompt SHALL NOT instruct the model to manually compute center coordinates as `width/2`, `height/2`.

#### Scenario: A prompt for centering uses the center node
- **WHEN** a user requests "a square in the center of the screen"
- **THEN** the AI generates a `center` node containing a `rect`, rather than a `rect` with manually computed `x: 480, y: 270`

#### Scenario: A prompt for a list of items uses a stack node
- **WHEN** a user requests "show a graph of Riemann sums" requiring multiple bars
- **THEN** the AI uses a `stack` or layout composition to arrange the bars, rather than computing individual `(x, y)` for each bar

### Requirement: The AI system prompt documents seconds-based duration and the no-mixing animation rule
The system prompt SHALL instruct the model that scene duration is expressed in seconds (e.g. `"2s"`, `"1.5s"`). The system prompt SHALL document both `primitives` and custom animation fields (`initial`, `transition`, `exit`, `exitTransition`), and it SHALL explicitly instruct the model not to combine them on the same node. The system prompt SHALL NOT include guidance on math node `width` or `height`.

#### Scenario: The system prompt contains seconds-based duration guidance
- **WHEN** the system prompt is constructed
- **THEN** it instructs the model to express duration in seconds and does not mention frame counts

#### Scenario: The system prompt documents the no-mixing rule for animations
- **WHEN** the system prompt is constructed
- **THEN** it explains that a node must use either `primitives` or custom animation fields, but never both

### Requirement: The system prompt is deterministically generated from the catalog
The system prompt generation SHALL be a pure function of the catalog definition and the video dimensions (width, height, fps). Given the same catalog and dimensions, `catalog.toPrompt()` SHALL produce the same string. No hand-written prompt content SHALL reference specific node types by name; all node-type documentation SHALL come from the catalog.

#### Scenario: Prompt generation is idempotent
- **WHEN** `catalog.toPrompt({ width: 960, height: 540, fps: 60 })` is called twice with the same catalog
- **THEN** both calls produce identical strings
