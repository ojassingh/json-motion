# prompt-to-video-api Specification

## Purpose
TBD - created by archiving change fix-ai-gateway-structured-output-schema. Update Purpose after archive.
## Requirements
### Requirement: Prompt generation produces a schema-valid video description
The prompt-to-video endpoint SHALL use AI SDK structured output to generate a
`VideoDescription` that conforms to the existing video scene schema, and the
provider-facing structured-output schema SHALL remain compatible with the
Gateway transport used by the generation layer.

#### Scenario: Structured output schema is accepted by the provider path
- **WHEN** the prompt generation module serializes the `VideoDescription`
  schema for structured output
- **THEN** the provider-facing schema avoids tuple-style array constructs that
  break the Gateway request before generation begins

