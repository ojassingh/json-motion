## Context

The current prompt-to-video architecture is already the smallest readable shape
for this product:

- `POST /api/generate-video` validates input and orchestrates generation.
- `lib/ai/generate-video-description.ts` uses AI SDK structured output.
- `lib/video/schema.ts` is the source of truth for `VideoDescription`.
- `lib/video/*` renders validated scene descriptions.

The failure is not in the renderer or route plumbing. The failure happens when
the AI SDK converts the Zod schema into JSON Schema for the provider. Tuple-like
definitions such as `z.tuple([...]).rest(...)` become `prefixItems`, and that
shape is rejected by the current Gateway/provider path.

## Decision

Use plain arrays with minimum lengths instead of tuple-with-rest schemas for the
provider-facing parts of the `VideoDescription` contract:

- `scenes`: change from tuple-with-rest to `z.array(...).min(1)`
- `keyframes`: change from tuple-with-rest to `z.array(...).min(2)`

The matching TypeScript types should move from tuple syntax to array syntax
while preserving the same semantic rules through validation.

## Rationale

- It is the least-code fix. We only change the schema shape that reaches the
  provider.
- It preserves the existing architecture: AI SDK structured outputs stay in
  place, the renderer stays untouched, and no custom schema conversion layer is
  introduced.
- It keeps the business rules intact: a video still requires at least one scene
  and a keyframe animation still requires at least two keyframes.

## Alternatives Considered

### Add a custom provider schema adapter

Rejected because it adds a translation layer that duplicates constraints already
expressed in Zod and increases maintenance cost.

### Drop structured outputs and parse raw JSON text

Rejected because it weakens the typed boundary, adds parsing failure modes, and
is more code than fixing the existing schema.

### Switch providers

Rejected because the bug is local to our schema shape and switching providers
would not reduce complexity in this codebase.

## Risks

- Changing tuple types to arrays slightly weakens compile-time tuple precision,
  so validation must remain the source of truth for minimum lengths.
- Other provider-incompatible schema constructs could still exist, so tests
  should assert the absence of `prefixItems` in the serialized schema.
