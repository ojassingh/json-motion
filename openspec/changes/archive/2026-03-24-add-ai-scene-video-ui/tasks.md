## 1. AI setup and shared contracts

- [x] 1.1 Add the AI SDK 6 dependency, the chosen provider package, and any
  needed shadcn components using Bun-based install commands.
- [x] 1.2 Add shared prompt-to-video request and response types under
  `lib/types/` plus prompt input validation for the new endpoint.
- [x] 1.3 Add a server-only prompt template/configuration module that constrains
  model output to the renderer's supported scene schema.

## 2. Prompt-to-video server flow

- [x] 2.1 Implement the AI scene-generation module using AI SDK 6 structured
  output and the existing `videoDescriptionSchema`.
- [x] 2.2 Implement a prompt-to-video orchestration service that validates the
  prompt, generates the scene, calls `renderVideo`, and normalizes failure
  cases.
- [x] 2.3 Add `POST /api/generate-video` and return the generated
  `VideoDescription` plus render metadata on success.

## 3. Prompt UI

- [x] 3.1 Replace the starter page with a simple prompt form built from shadcn
  components and explicit loading and disabled submit states.
- [x] 3.2 Show the latest successful result with a video preview and generated
  scene data on the same screen.
- [x] 3.3 Show actionable inline errors and keep the UI in-memory only, with no
  persistence or history requirements.

## 4. Verification

- [x] 4.1 Add automated tests for the prompt-to-video orchestration logic using
  mocked AI generation and render dependencies.
- [x] 4.2 Add coverage for the main success and failure response flows without
  relying on a live model or `ffmpeg`.
- [x] 4.3 Run `bun x ultracite check` and `bun test`, then fix any issues found.

## 5. Gateway compatibility follow-up

- [x] 5.1 Make the prompt generation path use the explicit AI SDK v6 Gateway
  provider and validate `AI_GATEWAY_API_KEY`.
- [x] 5.2 Replace the tuple-style `scenes` schema with a non-empty array shape
  that remains compatible with Gateway structured outputs.
- [x] 5.3 Add a minimal prompt-to-video smoke script for the sample prompt and
  update verification coverage and docs around the Gateway flow.
