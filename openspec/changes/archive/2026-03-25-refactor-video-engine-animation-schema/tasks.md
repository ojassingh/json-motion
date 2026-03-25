## 1. Schema and type refactor

- [x] 1.1 Replace the authored video types and Zod schema with the new flat node property model: `duration`, `anchor`, `primitives`, `animate`, named animation objects with frame-or-seconds timing, and animatable scene `background`.
- [x] 1.2 Remove legacy authored fields and validation paths for `durationInFrames`, `animations`, `animationPrimitives`, `anchorX`, `anchorY`, and nested `position`, and add validation for animation object shape, supported easing names, semantic anchors, and scene-bounded animation windows.
- [x] 1.3 Update shared timeline helpers and any type aliases that still depend on frame-only duration naming or the old transform layout.

## 2. Resolver normalization and interpolation

- [x] 2.1 Implement animation normalization helpers that convert seconds to frames using video `fps`, expand `scale` into `scaleX` and `scaleY`, and canonicalize single-step and multi-step animation objects into one internal segment format.
- [x] 2.2 Implement primitive expansion for `FadeIn`, `FadeOut`, `SlideIn`, `ScaleIn`, `Pop`, and `Wiggle`, then merge primitive-derived segments with explicit `animate` objects so explicit properties win on conflict.
- [x] 2.3 Replace the existing animation resolver with flat per-frame resolution that applies the new easing map, interpolates color properties and scene `background` through OKLCH, and returns renderer-facing resolved values without authored animation structures.

## 3. Callers, fixtures, and prompt surfaces

- [x] 3.1 Migrate sample video fixtures, schema-producing helpers, and prompt-to-video type/config surfaces to emit the new property names and animation-object syntax.
- [x] 3.2 Update any resolver-facing render and utility types so the draw layer reads resolved values only and no longer depends on authored `animate`, `primitives`, or nested position data.

## 4. Verification

- [x] 4.1 Rewrite schema and validation tests to cover animation object forms, seconds-based timing, semantic anchors, scene background animation, and rejection of legacy fields.
- [x] 4.2 Add resolver tests for primitive expansion, explicit override precedence, `duration` timeline math, and OKLCH color interpolation outputs.
- [x] 4.3 Run targeted video-engine and prompt-generation tests, then run `bun x ultracite fix`.
