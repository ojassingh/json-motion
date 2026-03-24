## Why

Live prompt generation is currently blocked before the model runs. The AI
Gateway rejects the generated `response_format` schema because parts of the
video description schema serialize as tuple-style arrays with `prefixItems`,
which the provider path does not accept for structured outputs.

## What Changes

- Replace tuple-with-rest array definitions in the video description contract
  with plain arrays that preserve the same minimum-length business rules.
- Keep the existing AI SDK structured-output architecture and renderer flow
  unchanged.
- Add regression coverage for the provider-facing schema shape and the prompt
  generation path.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `prompt-to-video-api`: Ensure the structured-output schema sent to the AI
  provider remains compatible with the Gateway transport while preserving the
  existing prompt-to-video behavior.

## Impact

- Affected code will be limited to the shared video types/schema definitions,
  prompt-generation tests, and regression coverage around schema serialization.
- No UI or render-pipeline behavior should change beyond unblocking prompt
  generation.
