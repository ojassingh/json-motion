## Why

AI-generated video JSON is unreliable — elements are mispositioned, misaligned, clipped off-screen, and compositions break unpredictably. The root cause is not prompt engineering: it's that the system gives the AI a raw pixel coordinate space with no layout abstractions, no structural constraints on composition, and no validation that the output is visually correct. The AI is asked to hand-compute pixel positions for every element, which it does inconsistently. This is an architectural problem: the system lacks the catalog-driven, constraint-based design that makes generative JSON reliable (as demonstrated by systems like json-render.dev). The current prompt is a long prose essay about rules — not a machine-readable contract the AI can reliably follow.

## What Changes

- **Introduce a catalog-driven component system** that formally defines what the AI can generate (component types, typed props, layout slots, valid enum values) so the system prompt is auto-generated from code rather than hand-written prose.
- **Add layout primitives** (`stack`, `center`, `align`) that replace raw pixel math for common composition patterns — the AI picks semantic layout intents, the renderer computes pixel positions.
- **Add structural validation** that catches visual errors (off-screen nodes, overlapping elements, groups with no visible area) before rendering, not after.
- **Replace the prose system prompt with a generated prompt** derived from the catalog, ensuring the AI only sees what actually exists and in a machine-readable format.
- **Normalize the text node dimension model** so anchor-based positioning works correctly for text (currently `getNodeDimensions` returns `width: 0` for text without `maxWidth`, breaking center-anchor math).
- **Add a frame-center convenience** so that "center of the frame" is expressible without the AI needing to know `width/2`, `height/2`.

## Capabilities

### New Capabilities
- `component-catalog`: A formal catalog system that declares available node types, their typed props (via Zod), valid enum values, layout slots, and descriptions — used to auto-generate the AI system prompt and validate AI output structurally.
- `layout-primitives`: Semantic layout nodes (`stack`, `center`, `align`) that the AI uses instead of raw pixel coordinates for common composition patterns, with the renderer resolving them to absolute positions.
- `visual-validation`: Post-generation structural checks that catch visual errors (nodes off-screen, zero-dimension elements, anchor miscalculations) before rendering begins.

### Modified Capabilities
- `video-scene-schema`: Schema gains new layout node types and constraints derived from the catalog. Text nodes gain a required `width` dimension for correct anchor math.
- `prompt-to-video-api`: System prompt is auto-generated from the catalog instead of hand-written. Prompt structure changes from prose to structured component documentation.

## Impact

- `lib/video/schema.ts` — new layout node types, text node dimension changes
- `lib/ai/prompt-to-video-config.ts` — replaced by catalog-driven prompt generation
- `lib/video/renderer.ts` — layout node resolution before drawing, text dimension fix
- `lib/video/animation.ts` — layout nodes resolved to absolute positions before animation
- `lib/video/validation.ts` — visual validation rules added
- New `lib/video/catalog.ts` — catalog definition system
- New `lib/video/layout.ts` — layout resolution logic
- Tests across `tests/ai/`, `tests/prompt-to-video/`, `tests/api/` need updates
