## Why

The repository already has a deterministic video renderer, but there is no
product-level workflow that lets someone describe a scene in plain language and
immediately see a rendered result. We need a minimal prompt-to-video flow now
to prove the end-to-end experience before adding persistence, editing tools, or
more complex authoring features.

## What Changes

- Add a prompt-driven video generation flow that accepts a natural-language
  request, uses AI SDK 6 to generate a schema-valid video description, and
  renders it through the existing server video pipeline.
- Add a simple home-page UI with a prompt field, submit action, loading state,
  error state, and preview area for the generated video.
- Add a dedicated server endpoint that orchestrates prompt validation, AI scene
  generation, schema validation, render execution, and the final response sent
  back to the UI.
- Return the generated scene description alongside render metadata so the first
  version is debuggable without adding persistence or a separate editor.
- Add automated tests around the prompt-to-video orchestration logic and error
  handling so AI output failures and render failures stay predictable.

## Capabilities

### New Capabilities
- `prompt-to-video-api`: Accept a text prompt, generate a valid video
  description with AI SDK 6, render it, and return the generated scene plus
  video metadata.
- `prompt-to-video-ui`: Let a user submit a prompt from the main UI, show the
  request lifecycle, and preview the latest generated video without persisting
  prior runs.

### Modified Capabilities
- None.

## Impact

- Affected code will include the main app page, a new prompt-to-video API route,
  server orchestration modules for AI generation, shared request/response types,
  and new tests.
- New runtime dependencies are expected for the AI SDK 6 package and a provider
  package such as `@ai-sdk/openai`.
- The change introduces a new environment requirement for `AI_GATEWAY_API_KEY`
  in addition to the existing local render prerequisites.
