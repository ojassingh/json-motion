## ADDED Requirements

### Requirement: The system exposes a prompt-to-video orchestration endpoint
The system SHALL expose a `POST /api/generate-video` endpoint that accepts a
JSON body containing a non-empty prompt string and rejects invalid requests
before calling a model or starting video rendering.

#### Scenario: Empty prompts are rejected before generation starts
- **WHEN** a client submits a request with a missing or blank `prompt`
- **THEN** the API returns a validation error response and does not call the AI
  generation layer or the video renderer

### Requirement: Prompt generation produces a schema-valid video description
The prompt-to-video endpoint SHALL use AI SDK 6 structured output to generate a
`VideoDescription` that conforms to the existing video scene schema, and the
system SHALL not start rendering unless the generated output validates
successfully.

#### Scenario: Invalid model output stops before rendering
- **WHEN** the model returns output that does not satisfy the video description
  schema
- **THEN** the API returns a generation failure response and no render job is
  started

### Requirement: Successful prompt generation renders and returns the generated scene
After the generated `VideoDescription` validates successfully, the system SHALL
render it through the existing video render service and return a success
response containing the generated scene plus render metadata for the created
video.

#### Scenario: Successful prompt requests return both scene and video metadata
- **WHEN** a valid prompt produces a valid video description and rendering
  succeeds
- **THEN** the API returns the generated `VideoDescription`, the render job id,
  and a retrievable video URL in the same response

### Requirement: Prompt-to-video failures are machine-readable
The prompt-to-video endpoint SHALL return structured error responses for prompt
validation failures, AI provider configuration failures, model generation
failures, and downstream render failures.

#### Scenario: Missing provider configuration returns an actionable error
- **WHEN** the prompt-to-video endpoint is called without `AI_GATEWAY_API_KEY`
  configured
- **THEN** the API returns a non-success response with a machine-readable error
  code and descriptive message instead of attempting generation
