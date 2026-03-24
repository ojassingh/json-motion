## Context

The repository already has a working prompt-to-video flow, but the current
experience waits for the entire request to finish before the user sees anything
useful. The page is also visually closer to a starter app than a product
playground, with a prefilled prompt, generic content hierarchy, and a single
blocking loading message.

This change introduces two new layers of behavior:

- A redesigned playground shell that makes the AI-to-JSON-to-video pipeline legible.
- A clearer loading experience on top of the existing blocking prompt-to-video
  request.

The main constraints are:

- Preserve the existing deterministic render result contract once a render is
  complete.
- Keep the first implementation in-memory only, with no persistence or job
  recovery requirements.
- Use Bun and the existing shadcn setup for any new UI primitives such as the
  progress bar.
- Stay compatible with the current Next.js 16, React 19, and local render
  architecture.

## Goals / Non-Goals

**Goals:**

- Present the home page as a deliberate playground rather than a generic form.
- Start the prompt field empty and offer clickable starter prompts below it.
- Improve the loading state without adding backend render-job tracking.
- Keep the final successful video response shape easy to consume from the UI and
  tests.

**Non-Goals:**

- Persisting render jobs across deploys, restarts, or multiple server instances.
- Adding polling, server-sent events, or a render-status endpoint.
- Reworking the core animation model or changing the renderer's deterministic
  output semantics.
- Adding a prompt history, auth layer, or document-style editor.

## Decisions

### 1. Keep the existing blocking prompt-to-video API

Rationale:

- It is the smallest implementation that satisfies the request for a better
  layout and loading state.
- It avoids introducing polling, job tracking, or render progress plumbing.
- It keeps the code easy to read and easy to roll back.

Alternative considered:

- Splitting the API into planning and rendering phases would expose JSON sooner,
  but it adds meaningfully more code and backend state than the current request
  needs.

### 2. Represent the UI as a staged workspace, not a single result card

The client should treat the page as a workflow with three visible regions:
focused navigation and hero copy, prompt composer with starter prompt actions,
and a lower workspace that pairs generated JSON with render state or final
video. While a request is pending, the workspace should show a richer loading
panel instead of a bare button label change.

Rationale:

- It matches the reference layout direction the user requested without copying
  the other product directly.
- It makes the conversion pipeline legible: prompt in, structured plan out,
  rendered frames after.
- It creates a natural place for progress, errors, and completion states without
  overloading one card.

Alternative considered:

- Keeping the current stacked cards would require less UI churn, but it would
  not communicate the product model or intermediate states clearly enough.

### 3. Use simple loading affordances instead of fake progress

The loading UI should use clear copy, lightweight motion, and disabled actions
to explain that generation and rendering are happening inside one blocking
request. It should not claim frame-level progress that the backend does not
expose.

Rationale:

- Honest UI is better than invented precision.
- It keeps the page simple and avoids coupling the client to speculative future
  backend behavior.
- It aligns with the user's preference for the least code possible.

Alternative considered:

- Adding a progress bar with mocked or estimated progress would look more active,
  but it would be misleading.

## Risks / Trade-offs

- [The generated JSON still appears only after the full request completes] ->
  Keep that limitation explicit in the copy and leave true staged updates for a
  later change if needed.
- [UI complexity increases] -> Keep a single page component composed from small
  display sections and use shared typed response models for each state.
- [The refreshed layout could feel decorative without clarity] -> Keep the
  content hierarchy tied to the real product flow and make loading copy concrete.

## Migration Plan

1. Keep the existing prompt-to-video API and response types unchanged.
2. Replace the current page layout with the new playground shell and starter
   prompts.
3. Add a clearer in-flight loading state that explains the existing blocking
   generation-and-render flow.
4. Update focused tests and run the repo checks.

Rollback is straightforward because the change is UI-only: revert the revised
page component and any related test updates.

## Open Questions

- Should a future follow-up split planning from rendering so the JSON can appear
  before the MP4 is finished?
