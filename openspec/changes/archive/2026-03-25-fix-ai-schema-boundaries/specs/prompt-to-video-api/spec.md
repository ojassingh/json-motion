## MODIFIED Requirements

### Requirement: Prompt generation produces a schema-valid video description
The prompt-to-video endpoint SHALL use AI SDK structured output bound to `videoAiOutputSchema` (not `videoDescriptionSchema`) to generate AI output. The generation pipeline SHALL then convert the AI output to a `VideoDescription` by parsing seconds durations to frame counts, computing `startFrame` for each scene, and injecting canvas metadata (`fps`, `width`, `height`) before validating against `videoDescriptionSchema`.

#### Scenario: Structured output schema is accepted by the provider path
- **WHEN** the prompt generation module serializes `videoAiOutputSchema` for structured output
- **THEN** the provider-facing schema is accepted and the generation pipeline produces a valid AI output object

#### Scenario: AI output with seconds duration is correctly converted to engine format
- **WHEN** the AI produces a scene with `duration: "3s"` and the canvas fps is 60
- **THEN** `generateSceneJson` produces an engine description with that scene having `duration: 180` and `startFrame` correctly computed

### Requirement: The AI system prompt documents seconds-based duration and the no-mixing animation rule
The system prompt SHALL instruct the model that scene duration is expressed in seconds (e.g. `"2s"`, `"1.5s"`). The system prompt SHALL document both `primitives` and custom animation fields (`initial`, `transition`, `exit`, `exitTransition`), and it SHALL explicitly instruct the model not to combine them on the same node. The system prompt SHALL NOT include guidance on math node `width` or `height`.

#### Scenario: The system prompt contains seconds-based duration guidance
- **WHEN** the system prompt is constructed
- **THEN** it instructs the model to express duration in seconds and does not mention frame counts

#### Scenario: The system prompt documents the no-mixing rule for animations
- **WHEN** the system prompt is constructed
- **THEN** it explains that a node must use either `primitives` or custom animation fields, but never both
