## 1. Schema — make math width/height optional in engine schema

- [x] 1.1 In `lib/video/schema.ts`, change `videoMathNodeSchema` so `width` and `height` are `positiveNumberSchema.optional()`
- [x] 1.2 Update `VideoMathNodeSchemaType` interface in `schema.ts` to mark `width` and `height` as optional
- [x] 1.3 Update `ResolvedMathNode` in `lib/types/video.ts` — `width` and `height` remain `number` (they will always be populated post-resolution)

## 2. Schema — add AI-specific schemas

- [x] 2.1 In `lib/video/schema.ts`, add `videoAiNodeBaseSchema` — copy the engine animation surfaces needed by AI output while keeping the schema independent from the engine schema
- [x] 2.2 Add AI-specific variants for each node type schema (e.g. `videoAiRectNodeSchema`, `videoAiTextNodeSchema`, `videoAiMathNodeSchema`, etc.) extending `videoAiNodeBaseSchema`
- [x] 2.3 AI math node schema requires only `latex` and `fontSize`; `width` and `height` are absent
- [x] 2.4 Add `videoAiNodeSchema` discriminated union using the AI-specific node schemas
- [x] 2.5 Add `videoAiSceneSchema` with `duration: z.string().regex(secondsPattern)`, no `startFrame`, using `videoAiNodeSchema`
- [x] 2.6 Update `videoAiOutputSchema` to use `videoAiSceneSchema`
- [x] 2.7 Reject AI nodes that combine `primitives` with `initial`/`transition`/`exit`/`exitTransition`

## 3. Generation pipeline — convert AI output to engine format

- [x] 3.1 In `lib/actions/ai.ts`, update `generateSceneJson` to convert each scene's seconds duration to frames: `Math.round(parseFloat(duration) * fps)`
- [x] 3.2 Compute `startFrame` per scene as the running cumulative sum of prior scenes' frame counts
- [x] 3.3 Update the structured output schema binding in `generateSceneJson` to use `videoCatalog.getSchema()` which should now return `videoAiOutputSchema` (verify this is the case)
- [x] 3.4 Verify the assembled engine description passes `videoDescriptionSchema.parse` after conversion

## 4. Layout — thread PreRenderCaches through layout resolution

- [x] 4.1 In `lib/video/layout.ts`, add optional `caches?: PreRenderCaches` parameter to `getStaticNodeDimensions`
- [x] 4.2 In `getStaticNodeDimensions`, when node type is `math` and cache is available, compute `{width: image.width * (fontSize / image.height), height: fontSize}` and return it; fall back to declared `width`/`height` or `{0, 0}`
- [x] 4.3 Thread `caches` through `resolveNodeLayout`, `resolveCenterChildren`, `resolveStackChildren`, `resolveAlignChildren` as needed
- [x] 4.4 Add optional `caches?: PreRenderCaches` to the exported `resolveLayout` function signature

## 5. Animation — thread PreRenderCaches through node resolution

- [x] 5.1 In `lib/video/animation.ts`, add optional `caches?: PreRenderCaches` parameter to `resolveMathNode`
- [x] 5.2 In `resolveMathNode`, compute `width` and `height` from the cache when available (same formula as layout); fall back to declared values if present, otherwise default to 0
- [x] 5.3 Thread `caches` through `resolveVideoNode`, `resolveSceneNodes`, and `resolveFrame`
- [x] 5.4 In `lib/video/renderer.ts`, update `renderFrameToRgba` to pass `caches` to `resolveFrame`

## 6. Prompt — update system prompt and catalog

- [x] 6.1 In `lib/video/catalog.ts`, change the system prompt canvas line from "Keep each scene between 48 and 120 frames" to "Keep each scene between 1s and 3s. Express duration in seconds (e.g. `"2s"`, `"1.5s"`)"
- [x] 6.2 Keep the custom animation guidance in `generateAnimationSection`, but explicitly instruct the model not to combine it with `primitives` on the same node
- [x] 6.3 Keep documentation of `initial`, `transition`, `exit`, `exitTransition` in the shared properties line in `generatePrompt`, while documenting the no-mixing rule
- [x] 6.4 Remove `width` and `height` from the math node catalog entry description (they are no longer required)
- [x] 6.5 In the output rules, update the duration rule: "Express scene duration in seconds (e.g. `"2s"`). Never use raw frame numbers."

## 7. Tests — update and verify

- [x] 7.1 Update any test fixtures in `tests/` that use hardcoded math node `width`/`height` to omit them and verify layout still works with caches threaded through
- [x] 7.2 Add a test verifying a math node inside `center` resolves to visually centered coordinates when caches are provided
- [x] 7.3 Add a test verifying `videoAiOutputSchema` rejects a node that mixes `primitives` with `initial`/`transition`/`exit`/`exitTransition`
- [x] 7.4 Add a test verifying `videoAiOutputSchema` rejects a scene with integer `duration` and accepts seconds string
- [x] 7.5 Add a test verifying `generateSceneJson`-style conversion produces correct `startFrame` and frame-count `duration` for multi-scene output
- [x] 7.6 Run the full test suite and fix any regressions
