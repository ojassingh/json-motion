## Why

The AI-facing schema is not properly separated from the internal engine schema, so the model is given control over fields it either cannot correctly know (math node dimensions, frame-count duration) or should never be able to express (custom animations). This produces misaligned layouts, frame-count thinking instead of seconds-based authoring, and non-deterministic output when the AI mixes primitives with custom animation fields.

## What Changes

- **BREAKING** Scene `duration` in the AI output schema changes from a frame integer to a seconds string (e.g. `"2s"`). The server converts to frames before engine validation.
- `startFrame` is removed from the AI output schema entirely — it is always computable from scene order and is injected server-side.
- `initial`, `transition`, `exit`, and `exitTransition` remain available in the AI-facing node schema, but a node must use either custom animation fields or `primitives`, never both together.
- `width` and `height` are removed from the math node AI schema. Actual rendered dimensions are derived from the pre-rendered image and `fontSize`, so declaring them is meaningless and causes layout errors.
- The layout and node resolution pipeline is updated to thread `PreRenderCaches` so `center`, `stack`, and `align` containers compute accurate bounds for math nodes at render time.
- The internal engine schema (`videoDescriptionSchema`, `videoNodeBaseSchema`) is unchanged — it continues to support custom animations and frame-based timing for programmatic use.

## Capabilities

### New Capabilities

- `ai-video-schema`: The contract for the AI-specific output schema — a strict, minimal subset of the engine schema. Covers AI-only scene schema (seconds duration, no startFrame), AI-only math node (no width/height), and a validation rule that rejects mixing `primitives` with custom animation fields on the same node.

### Modified Capabilities

- `video-scene-schema`: Scene timing requirements change — duration now accepts seconds strings in AI context; the engine schema acceptance of frame integers is unchanged but the AI path no longer permits raw frame counts.
- `math-node-rendering`: Math node `width` and `height` cease to be required inputs. Actual bounding box dimensions are computed from the pre-rendered image during layout, and the resolved node carries correct dimensions.
- `prompt-to-video-api`: The AI generation pipeline uses the new AI-specific schema for structured output and injects `startFrame` + frame-count `duration` server-side after conversion.

## Impact

- `lib/video/schema.ts` — new `videoAiSceneSchema`, `videoAiNodeBaseSchema`, and AI-specific node schemas; `videoMathNodeSchema` makes `width`/`height` optional
- `lib/video/animation.ts` — `resolveFrame`, `resolveSceneNodes`, `resolveVideoNode`, `resolveMathNode` accept `PreRenderCaches` to derive correct math dimensions
- `lib/video/layout.ts` — `resolveLayout` and `getStaticNodeDimensions` accept `PreRenderCaches`; math node bounds resolved from actual image
- `lib/video/renderer.ts` — `renderFrameToRgba` passes caches into `resolveFrame`
- `lib/actions/ai.ts` — converts seconds duration to frames, computes `startFrame` per scene before engine validation
- `lib/ai/prompt-to-video-config.ts` — system prompt updated to use seconds, remove custom animation docs, remove math width/height docs
- `lib/video/catalog.ts` — prompt generation removes custom animation section for AI context
