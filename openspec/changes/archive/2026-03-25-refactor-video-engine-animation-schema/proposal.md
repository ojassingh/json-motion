## Why

The current video schema splits motion across `transform`, `animations`, named effects, pixel anchors, and frame-only timing, which makes agent-authored scenes verbose and forces the resolver to carry multiple animation models at once. We need a single animation contract now so the schema is easier to generate, the resolver stays deterministic, and future prompt-generated scenes target one stable format.

## What Changes

- **BREAKING** Replace node-level `animations` arrays and keyframe/effect distinctions with a single optional `animate` object whose keys are animatable properties and whose values are named animation objects or arrays of those objects.
- **BREAKING** Flatten node positioning by removing `position` and using top-level `x` and `y` properties that can be static or animated.
- **BREAKING** Replace pixel-based `anchorX` and `anchorY` with a semantic `anchor` string enum derived from node dimensions during rendering.
- **BREAKING** Rename scene timing from `durationInFrames` to `duration` and allow animation timing values to be expressed in frames or seconds.
- Expand the animatable property surface so visual and transform properties resolve through one consistent named-object pipeline, including scene `background`.
- Keep `primitives` as a shorthand authoring surface for built-in enter and emphasis motions, but require the resolver to expand them into the same animation-object format before applying explicit `animate` overrides.
- Update easing identifiers to kebab-case CSS-style names and switch color interpolation to OKLCH for all animated color properties.
- Tighten the resolver contract so it returns one flat resolved object per node for the current frame, and the draw layer reads only those resolved values.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `video-scene-schema`: Replace the existing animation, transform, anchor, timing, and scene background requirements with the new `animate` object model and renamed scene duration field.
- `frame-rendering-pipeline`: Change the resolver contract to expand primitives, normalize time units, interpolate colors in OKLCH, and emit flat resolved node values consumed by the draw layer.

## Impact

- Affected code will primarily be under `lib/video/schema.ts`, `lib/types/video.ts`, `lib/video/validation.ts`, `lib/video/animation.ts`, `lib/video/timeline.ts`, fixtures, tests, and prompt-to-video type/config surfaces that still emit the old schema.
- The render request shape changes in a breaking way for any callers or fixtures that still send `durationInFrames`, `animations`, `anchorX`, `anchorY`, or nested `position`.
- No new runtime dependencies are required if OKLCH interpolation can be implemented with existing utilities; otherwise a small color conversion helper may be added inside the video module.
- FFmpeg integration, Skia rasterization, and node-specific draw functions remain out of scope for this change.
