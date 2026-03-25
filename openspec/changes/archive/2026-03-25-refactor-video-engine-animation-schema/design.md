## Context

The current video engine models motion through several overlapping concepts: base transforms live under `transform`, animated values live in `animations`, named effects are a separate discriminated branch, scene timing uses `durationInFrames`, and anchor math depends on raw `anchorX` and `anchorY` pixels. That shape has already spread into the Zod schema, inferred types, validation helpers, sample fixtures, prompt-generation guidance, and the pure frame resolver.

This change is intentionally narrower than the original renderer build-out. It refactors the request schema and the pure resolution layer only. FFmpeg orchestration, Skia rasterization, and node-specific draw functions are not being redesigned. The main constraint is that the resolver must absorb the new authoring model while keeping rendering deterministic and keeping the draw layer dependent on resolved values instead of schema-only animation structures.

## Goals / Non-Goals

**Goals:**

- Replace the current animation model with one optional `animate` object per node, using named animation objects for numeric and color interpolation.
- Flatten positional authoring so `x` and `y` are first-class animatable node properties instead of nested fields.
- Replace pixel anchor inputs with a semantic `anchor` enum while preserving deterministic transform behavior.
- Support time values in frames or seconds and normalize them against `fps` before interpolation.
- Keep shorthand `primitives` available for common motions, but compile them into the same tuple model the resolver uses everywhere else.
- Update the resolver contract so every frame resolves to flat node values, including colors and scene background, with explicit animation values taking precedence over primitive-derived values.

**Non-Goals:**

- Changing FFmpeg process management, output storage, or the render API lifecycle.
- Rewriting Skia drawing code or node-specific paint functions.
- Adding new node types beyond the existing supported scene graph.
- Introducing runtime timeline editing, physics simulation, or author-defined custom easing curves.

## Decisions

### 1. Use a unified "static or animated" property model across node fields

The schema will move away from `transform` plus `animations` and instead allow animatable properties to live directly on the node in their authored form. Each supported property will accept either a static value or one named animation object, and animation-valued properties may also accept an array of those objects for multi-step motion. `scale` will be treated as a shorthand authored property that expands into `scaleX` and `scaleY` during normalization instead of becoming a separate render-time branch.

Rationale:

- A single authoring shape is easier for agents and fixtures to produce correctly.
- Property-local animation objects avoid splitting a property's default, start, and easing information across multiple structures.
- Keeping `scale` as shorthand preserves ergonomics without forcing the renderer to learn a new transform axis.

Alternative considered:

- Keeping the existing `transform` object and adding a parallel `animate` overlay would reduce migration churn, but it would preserve two competing sources of truth for every transform property.

### 2. Normalize authored animation objects into an internal segment representation before resolving frames

The resolver will gain a normalization pass that converts every authored animation object into a canonical segment with explicit `from`, `to`, `startFrame`, `endFrame`, and `easing`. That pass will also convert `"0.5s"`-style inputs into frame counts using the video `fps`, expand `primitives` into property segments, and fan out `scale` into `scaleX` plus `scaleY`. Validation and resolution can then operate on one normalized structure instead of branching on partial object shapes or time unit shape at every call site.

Rationale:

- It isolates schema flexibility from interpolation math.
- It keeps validation rules straightforward because all time windows can be checked after normalization.
- It provides a clean seam for testing primitives, seconds-to-frames conversion, and precedence behavior independently of rendering.

Alternative considered:

- Resolving partial animation objects and time strings lazily inside interpolation would reduce up-front transformation work, but it would spread parsing logic through the resolver and make correctness harder to test.

### 3. Compile primitives first, then let explicit `animate` values win by property

`primitives` will remain as a lightweight authoring shorthand for `FadeIn`, `FadeOut`, `SlideIn`, `ScaleIn`, `Pop`, and `Wiggle`. The resolver will expand them into normalized property segments before reading the node's explicit `animate` object. If both sources produce segments for the same property, the explicit `animate` definition will replace the primitive-derived value for that property rather than attempting to blend the two.

Rationale:

- This preserves shorthand ergonomics without making primitives a second execution path.
- A deterministic precedence rule is simpler than composition rules that depend on primitive order or property type.
- Property-level override behavior is easy to document and test.

Alternative considered:

- Merging primitives and explicit tuples segment-by-segment could support more layering, but it would make conflict resolution ambiguous and harder for prompt authors to predict.

### 4. Move easing and color interpolation into central resolver utilities

The resolver will use one easing lookup keyed by kebab-case names: `ease-out`, `ease-in`, `ease-in-out`, `linear`, `ease-in-expo`, `ease-out-expo`, `ease-in-back`, `ease-out-back`, and `spring`. Numeric interpolation will continue to be linear after easing is applied. Color interpolation for `fill`, `stroke`, `color`, and scene `background` will switch from RGB-style interpolation to a new `lerpOklch(colorA, colorB, t)` helper that converts hex colors to OKLCH, interpolates channels linearly, and returns a hex color.

Rationale:

- Centralized easing keeps tuple parsing and frame math consistent across every animatable property.
- OKLCH interpolation produces more perceptually stable transitions for the palette-heavy scenes this engine generates.
- The utility boundary keeps renderer code ignorant of color math details.

Alternative considered:

- Preserving the current easing set and RGB interpolation would minimize implementation work, but it would not satisfy the new authoring contract or the requested color behavior.

### 5. Keep the resolved output flat and renderer-oriented

The resolver will emit flat resolved node objects whose animatable fields have already been reduced to concrete frame values. The draw layer should not read `animate`, `primitives`, keyframe metadata, or nested `position` data. Semantic `anchor` remains a resolved field so anchor interpretation stays tied to resolved dimensions and not to the authored schema internals.

Rationale:

- The renderer already expects mostly resolved data, so this keeps the refactor concentrated in the pure math boundary.
- Flat resolved values make snapshot-style tests much easier to write.
- Removing schema-only animation structures from draw-time code prevents future renderer drift as the authoring model evolves.

Alternative considered:

- Allowing renderer helpers to keep inspecting authored animation structures would reduce short-term refactor pressure, but it would preserve coupling between rasterization and schema evolution.

## Risks / Trade-offs

- [Breaking schema migration] -> Update fixtures, tests, prompt-generation guidance, and any API callers in the same change so old fields do not linger in generated descriptions.
- [Tuple ambiguity] -> Normalize tuple arity immediately and reject malformed tuples or unsupported property keys with targeted validation errors.
- [Primitive semantics drift] -> Define fixed default expansions for each primitive in resolver tests so later refactors do not silently change motion behavior.
- [Color conversion edge cases] -> Limit animated color inputs to supported hex formats for now and cover interpolation with focused unit tests.
- [Renderer contract mismatch] -> Keep resolved node field names intentionally aligned with the existing renderer-facing types wherever possible, even as authored input fields change.

## Migration Plan

1. Update the OpenSpec capability deltas for `video-scene-schema` and `frame-rendering-pipeline`.
2. Refactor the shared video types, Zod schema, and validation helpers around `duration`, `anchor`, `primitives`, and `animate`.
3. Rewrite the pure animation resolver to normalize times, compile primitives, resolve animation objects, and emit flat resolved values with OKLCH color interpolation.
4. Migrate fixtures, tests, prompt-generation config, and any schema-producing helpers to the new authoring format.
5. Verify the change with unit tests and schema serialization checks, then run `bun x ultracite fix` to keep the repo compliant.

Rollback is straightforward because the change is code-only: revert the schema, types, resolver, and fixture updates together to restore the previous request contract.

## Open Questions

- The request names the supported primitives but not their exact default amplitudes or durations for `Pop` and `Wiggle`; implementation should document one deterministic expansion per primitive in tests unless a stronger product default already exists in code review.
