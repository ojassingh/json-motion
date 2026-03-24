## Context

The repository already contains a working deterministic render stack:
`lib/video/*` validates a `VideoDescription`, resolves frames, renders them, and
encodes an MP4 through the existing `POST /api/render` route. The current UI is
still the default starter page, so there is no product surface that lets a user
enter a prompt, generate a scene, and immediately preview the resulting video.

This change adds three new concerns on top of the renderer:

- Prompt input and request lifecycle in the main UI.
- AI-driven scene generation that must remain fully typed and schema-valid.
- A thin orchestration layer that combines AI generation with the existing
  render service without weakening the renderer's current contract.

The main constraints are:

- Use AI SDK 6 patterns instead of older AI SDK 5 APIs.
- Keep the architecture simple and readable because the first version does not
  need history, retries, persistence, or streaming partial results.
- Preserve the existing render route as a low-level primitive so prompt-driven
  generation does not contaminate the renderer with LLM concerns.
- Stay compatible with the current Next.js 16, React 19, Bun, shadcn base UI,
  and Ultracite setup.

## Goals / Non-Goals

**Goals:**

- Provide a single prompt-to-video flow from the home page.
- Generate a schema-valid `VideoDescription` from a prompt using AI SDK 6.
- Reuse the existing render service instead of creating a second render path.
- Return the generated scene data with the video result so the first version is
  easy to debug.
- Add automated tests for the orchestration logic and request failure cases.
- Keep new shared contracts in `lib/types/` and avoid helper extraction unless
  logic is reused.

**Non-Goals:**

- Prompt history, saved generations, or a scene library.
- Interactive scene editing after generation.
- Streaming partial scene JSON into the UI.
- Multi-step agent workflows, tools, or image generation.
- Changes to the underlying frame renderer, encoder, or scene schema beyond what
  is already supported today.

## Decisions

### 1. Add a dedicated prompt orchestration route instead of expanding `POST /api/render`

The implementation should add a new route such as
`POST /api/generate-video` that accepts a prompt, generates a typed scene, calls
the existing `renderVideo` service, and returns both the render metadata and the
generated `VideoDescription`. The existing `POST /api/render` route should stay
focused on rendering an already-formed scene description.

Rationale:

- It preserves the current renderer boundary and keeps the render API useful for
  tests and future non-AI clients.
- It avoids mixing LLM error handling with lower-level render validation.
- It yields the smallest readable architecture: one low-level render primitive
  plus one orchestration endpoint.

Alternative considered:

- Extending `POST /api/render` to accept either a prompt or a scene
  description would reduce route count, but it would blur responsibilities and
  make request typing and error handling harder to reason about.

### 2. Use AI SDK 6 structured output on the server with the existing Zod scene schema

Scene generation should happen in a server-only module such as
`lib/ai/generate-video-description.ts` using AI SDK 6 structured output with the
existing `videoDescriptionSchema`. The module should produce a validated
`VideoDescription` and never expose raw model text to the rest of the app.

Rationale:

- Reusing the renderer's schema keeps one source of truth for scene shape.
- Structured output keeps the AI boundary fully typed and avoids ad hoc JSON
  parsing.
- A dedicated server module makes the provider choice and prompt template easy
  to test and swap later.

Alternative considered:

- Letting the model return free-form JSON and validating it later would require
  more parsing code and make failures harder to categorize.

### 3. Keep the client UI simple and avoid experimental AI SDK UI hooks in v1

The page should use a single client component with a controlled prompt field,
explicit submit handler, disabled/loading states, and local result state for the
latest request. It should call the new server route with `fetch` and render the
latest success or error response. The first version should not use
`experimental_useObject` or a chat-style hook.

Rationale:

- The feature is a single-shot request, not a chat session.
- The route must wait for both AI generation and video rendering anyway, so
  partial object streaming does not materially improve the first UX.
- Avoiding experimental hooks reduces API churn and keeps the page easy to read.

Alternative considered:

- Using `experimental_useObject` would align with structured JSON streaming, but
  it adds experimental API surface and does not remove the need for a custom
  render-complete response.

### 4. Introduce small shared contracts under `lib/types/` for request and response shapes

The change should add explicit types such as `PromptToVideoRequest`,
`PromptToVideoResponse`, and a small generated-scene summary shape under
`lib/types/`. Server modules and the UI should share these types instead of
  duplicating inline object literals.

Rationale:

- Shared route types keep the API easy to change safely.
- It follows the user's request to keep types organized under `lib/types/`.
- The contracts are meaningful reuse, unlike generic helpers that only save a
  few lines.

Alternative considered:

- Defining response types inline in the route and page would be slightly faster,
  but it would repeat the same shapes and weaken type safety at the boundary.

### 5. Test the orchestration layer with mocked AI and render dependencies

The core prompt-to-video service should be implemented as a pure orchestrator
that depends on two injected boundaries: `generateVideoDescriptionFromPrompt`
and `renderVideo`. Tests should mock those boundaries to verify success, schema
failure, provider failure, and render failure behavior without calling a real
model or `ffmpeg`.

Rationale:

- It keeps tests fast and deterministic.
- It verifies the new business logic instead of re-testing the renderer's
  internals.
- It makes future provider swaps easier because the orchestration behavior stays
  covered.

Alternative considered:

- Driving end-to-end tests against a real model would be slow, flaky, and hard
  to run locally or in CI.

### 6. Use the explicit AI Gateway provider and avoid tuple-style scene arrays

The prompt generation module should use the AI SDK v6 Gateway provider
explicitly via `gateway("<provider>/<model>")` instead of relying on an
implicit string model id. The scene schema should also model `scenes` as a
plain non-empty array rather than a tuple-with-rest shape so the Gateway
structured-output transport emits a stable top-level JSON Schema object.

Rationale:

- It matches the documented AI SDK v6 Gateway usage and keeps the provider
  boundary explicit in the code.
- It aligns the runtime environment contract around `AI_GATEWAY_API_KEY`.
- It avoids a Gateway structured-output failure triggered by tuple-style array
  schemas while preserving the same business rule of requiring at least one
  scene.

Alternative considered:

- Keeping the tuple-with-rest schema and switching providers would avoid the
  immediate failure, but it would leave the Gateway path broken and preserve an
  implicit provider boundary.

## Risks / Trade-offs

- [Model output quality] -> Constrain generation with the existing Zod schema
  and add a focused system prompt that limits output to supported scene types and
  animations.
- [Slow first response] -> Show an explicit loading state and keep the first UI
  to a single in-flight request without persistence or polling.
- [Provider configuration failures] -> Validate the required API key at request
  time and return actionable server errors.
- [Gateway structured output compatibility] -> Prefer JSON Schema forms that
  serialize as plain objects and arrays, and keep a small live smoke script for
  prompt generation plus rendering.
- [Overscoped prompt instructions] -> Keep the prompt template narrow and biased
  toward the renderer's current capabilities instead of promising unsupported
  nodes or effects.
- [Architecture drift] -> Keep AI concerns in `lib/ai/` or another server-only
  boundary and leave `lib/video/` unchanged except for reuse.

## Migration Plan

1. Add the AI SDK 6 dependency and provider package, plus the required
   `AI_GATEWAY_API_KEY` environment variable.
2. Add shared prompt-to-video request and response types under `lib/types/`.
3. Implement the server-only AI generation module and the orchestration service.
4. Add the new `POST /api/generate-video` route and keep `POST /api/render`
   unchanged.
5. Replace the starter page with the new prompt UI and shadcn-based loading and
   result states.
6. Add unit tests for the orchestration logic and run Ultracite plus the test
   suite before considering the change complete.

Rollback is straightforward because the change is additive: remove the new route,
UI modules, AI dependency, and associated environment configuration while
leaving the existing render stack untouched.

## Open Questions

- Should the UI display the full generated scene JSON by default, or collapse it
  behind a debug disclosure once the basic flow is working?
- Do we want a lightweight prompt template that enforces a fixed visual style
  for consistency, or should the first version maximize prompt freedom?
