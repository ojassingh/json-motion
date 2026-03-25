## Context

The video engine has two schema layers that are currently conflated:

1. **Engine schema** (`videoDescriptionSchema`) — used by the renderer and validated internally. Works in frame counts, supports full custom animation via `initial`/`transition`/`exit`/`exitTransition`, and requires explicit `startFrame` on scenes.

2. **AI output schema** (`videoAiOutputSchema`) — what the AI generates. Currently it is just a thin wrapper around the same scene/node schemas as the engine, meaning the AI can author frame counts, meaningless math dimensions, and conflicting animation declarations that combine `primitives` with custom keyframed fields on the same node.

Additionally, `resolveLayout` and `resolveMathNode` in the animation pipeline are unaware of the pre-render cache, so math node bounds are computed from declared `width`/`height` (which the renderer ignores) rather than from the actual rendered image dimensions.

## Goals / Non-Goals

**Goals:**
- A dedicated AI-facing schema that is a strict, minimal subset of the engine schema
- Duration expressed in seconds throughout the AI interface; conversion to frames is server-side only
- The AI can produce either custom animation fields or `primitives`, but never both on the same node
- Math node layout uses actual rendered dimensions from the pre-render cache
- The engine schema is unchanged — programmatic use retains full capability

**Non-Goals:**
- Changing the rendering pipeline beyond threading caches to layout/resolution
- Redesigning the primitives system or adding new primitives
- Changing how graph nodes (`functionGraph`, `parametricGraph`) handle dimensions — they have explicit bounding boxes that are meaningful
- Supporting mixed custom + primitive animations on the same node

## Decisions

### Decision 1: Separate AI schema built from dedicated base schemas, with an explicit no-mixing animation rule

**Choice:** Create `videoAiNodeBaseSchema` and `videoAiSceneSchema` as independent schema definitions, not as `.omit()` wrappers on engine schemas. Keep both `primitives` and custom animation fields available, then reject nodes that combine them.

**Why:** Zod `.omit()` and `.strip()` approaches create brittle coupling — any new field added to the engine schema silently leaks into the AI schema unless explicitly re-omitted. Explicit separate definitions make the AI contract clear and stable. The trade-off is some duplication of field declarations (id, x, y, opacity, etc.), which is acceptable given the schemas are small and the contract is critical.

**Alternatives considered:**
- `.omit()` on `videoNodeBaseSchema` — rejected because it implicitly includes future additions
- Runtime stripping in `generateSceneJson` — rejected because schema-level rejection gives better error messages and is enforced at AI SDK structured output binding time

### Decision 2: Seconds string for AI duration; frame integer internally

**Choice:** `videoAiSceneSchema` uses `duration: z.string().regex(secondsPattern)` (same pattern as `videoNodeTransitionSchema`). `generateSceneJson` converts and injects `startFrame` before handing to `videoDescriptionSchema.parse`.

**Why:** The AI already authors `transition.duration` in seconds — this makes scene duration consistent. The regex enforcement means the AI SDK's structured output binding produces the right format without prompting. Frame counts are an implementation detail of the renderer, not a user-facing concept.

**Conversion:**
```
durationFrames = Math.round(parseFloat(duration) * fps)
startFrame = sum of all prior scenes' durationFrames
```

### Decision 3: Thread PreRenderCaches through layout and resolution

**Choice:** Add an optional `caches?: PreRenderCaches` parameter to `resolveLayout`, `getStaticNodeDimensions`, `resolveFrame`, `resolveSceneNodes`, `resolveVideoNode`, and `resolveMathNode`. `renderFrameToRgba` passes its existing caches down.

**Why:** The pre-render phase already runs before any frame rendering. The caches are available at the call site. Threading them through is a contained change — each function gets one extra optional parameter. This is preferable to a global cache, a context object, or a two-pass layout system.

**Math node resolved dimensions:**
```
scale = fontSize / image.height
resolvedWidth = image.width * scale
resolvedHeight = fontSize
```

These become the `width`/`height` on the `ResolvedMathNode`, replacing the declared values. Both `getAnchorOffset` in the renderer and `getStaticNodeDimensions` in layout then use accurate dimensions.

**Fallback:** If no caches are provided or the image isn't found (e.g. in tests or programmatic use), fall back to declared `width`/`height` values if present, otherwise `{width: 0, height: 0}`.

### Decision 4: Make math width/height optional in the engine schema; remove from AI schema

**Choice:** Change `videoMathNodeSchema` to have `width` and `height` as optional. Remove them from the AI-facing math schema entirely.

**Why:** Width and height on math nodes have always been fictional — the renderer never used them to scale the drawn image. Making them optional in the engine schema preserves backward compatibility for any existing serialized descriptions. Removing them from the AI schema prevents the AI from generating misleading values.

**Layout fallback when no cache:** If `width`/`height` are omitted and no cache is available, the node has zero dimensions for layout purposes, which means it will position at 0,0. This is acceptable for programmatic use without caches; the correct usage path always has caches.

## Risks / Trade-offs

- **Existing serialized video descriptions with math `width`/`height`** → Making them optional means old data still validates. The resolver uses cache dimensions if available, falling back to declared values, so existing data renders as before or better.
- **Test suite uses hardcoded frame counts** → Tests that create `VideoDescription` fixtures directly will continue to work since the engine schema is unchanged. Tests for AI generation will need to use seconds strings.
- **Cache threading adds function signature noise** → Optional parameter approach keeps call sites that don't have caches (tests, layout-only utilities) unchanged. A future refactor could bundle this into a render context object, but that's out of scope here.
- **AI model may still produce both primitives and custom fields together** → Structured output schema validation rejects those nodes before they reach the application. The risk is limited to regeneration overhead, not runtime behavior.

## Migration Plan

1. Update `videoMathNodeSchema` — make `width`/`height` optional (no breaking change)
2. Add `videoAiNodeBaseSchema` and AI-specific node schemas to `schema.ts`
3. Add `videoAiSceneSchema` and update `videoAiOutputSchema` to use it
4. Update `generateSceneJson` — convert duration seconds to frames, compute startFrame
5. Thread `PreRenderCaches` through `layout.ts` → `getStaticNodeDimensions` for math
6. Thread `PreRenderCaches` through `animation.ts` → `resolveFrame` → `resolveMathNode`
7. Update `renderFrameToRgba` to pass caches into `resolveFrame`
8. Update system prompt and catalog to remove frame guidance, custom animation docs, math width/height
9. Update tests

No migration of stored data is required. The engine schema change (optional math dimensions) is backward compatible.
