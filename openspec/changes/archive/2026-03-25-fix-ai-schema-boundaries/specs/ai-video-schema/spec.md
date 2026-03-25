## ADDED Requirements

### Requirement: The AI output schema uses seconds-based scene duration with no startFrame
The system SHALL define a dedicated `videoAiSceneSchema` where `duration` is a seconds string matching the pattern `/^\d+(?:\.\d+)?s$/` (e.g. `"2s"`, `"1.5s"`). The `startFrame` field SHALL NOT appear in `videoAiSceneSchema` — it is always derived from scene order and injected server-side. The `videoAiOutputSchema` SHALL use `videoAiSceneSchema` for its scenes array.

#### Scenario: AI scene with seconds duration passes AI schema validation
- **WHEN** an AI-generated scene declares `duration: "2s"` with no `startFrame`
- **THEN** `videoAiOutputSchema` parses it successfully

#### Scenario: AI scene with frame-count duration is rejected
- **WHEN** an AI-generated scene declares `duration: 120` (a raw integer)
- **THEN** `videoAiOutputSchema` rejects it before the generation pipeline converts to engine format

#### Scenario: AI scene with startFrame is rejected
- **WHEN** an AI-generated scene includes a `startFrame` field
- **THEN** `videoAiOutputSchema` rejects it

### Requirement: The server converts AI scene duration to frames and computes startFrame before engine validation
The `generateSceneJson` function SHALL convert each AI scene's seconds duration to a frame count using `Math.round(parseFloat(duration) * fps)`, compute `startFrame` for each scene as the cumulative sum of all prior scenes' frame counts, and then validate the assembled description against `videoDescriptionSchema`.

#### Scenario: A single-scene AI output produces correct startFrame and duration
- **WHEN** the AI output includes one scene with `duration: "2s"` and `fps` is 60
- **THEN** the engine-facing description has `duration: 120` and `startFrame: 0`

#### Scenario: Multi-scene AI output produces correct sequential startFrames
- **WHEN** the AI output includes two scenes with durations `"2s"` and `"1.5s"` and `fps` is 60
- **THEN** the engine-facing description has scene 0 with `startFrame: 0, duration: 120` and scene 1 with `startFrame: 120, duration: 90`

### Requirement: The AI output schema preserves the engine animation surfaces but forbids mixing them
The system SHALL define a `videoAiNodeBaseSchema` that includes `id`, `x`, `y`, `anchor`, `opacity`, `rotate`, `scale`, `scaleX`, `scaleY`, `skewX`, `skewY`, `zIndex`, `primitives`, `initial`, `transition`, `exit`, and `exitTransition`. All AI-specific node type schemas (rect, text, math, group, center, stack, align, functionGraph, parametricGraph) SHALL extend `videoAiNodeBaseSchema`. A node SHALL use either `primitives` or custom animation fields, but SHALL NOT combine both on the same node.

#### Scenario: An AI node with only primitives passes AI schema validation
- **WHEN** an AI-generated node declares `primitives: ["BlurFadeIn", "FadeOut"]` with no other animation fields
- **THEN** `videoAiOutputSchema` parses it successfully

#### Scenario: An AI node with only custom animation fields passes AI schema validation
- **WHEN** an AI-generated node includes `initial: { opacity: 0 }` and `transition: { duration: "0.3s" }` with no primitives
- **THEN** `videoAiOutputSchema` parses it successfully

#### Scenario: An AI node that mixes primitives with custom animation fields is rejected
- **WHEN** an AI-generated node includes `primitives: ["FadeIn"]` together with `initial: { opacity: 0 }` or `transition: { duration: "0.3s" }`
- **THEN** `videoAiOutputSchema` rejects it

### Requirement: The AI math node schema requires only latex and fontSize
The AI-facing math node schema SHALL require `latex` (string) and `fontSize` (positive number). It SHALL NOT include `width` or `height` fields. The `color` field SHALL remain optional.

#### Scenario: AI math node with only latex and fontSize passes validation
- **WHEN** an AI-generated math node declares `latex: "E = mc^2"` and `fontSize: 48` with no width or height
- **THEN** `videoAiOutputSchema` parses it successfully

#### Scenario: AI math node with width and height is rejected
- **WHEN** an AI-generated math node includes `width: 400` and `height: 100`
- **THEN** `videoAiOutputSchema` rejects it due to unexpected fields
