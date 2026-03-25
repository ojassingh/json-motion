## 1. Fix text node dimension model (immediate bug fix)

- [x] 1.1 Update `getNodeDimensions` in `lib/video/renderer.ts` to compute text width via canvas text measurement when `maxWidth` is not provided, so `getAnchorOffset` returns correct values for `anchor: "center"` on text nodes
- [x] 1.2 Thread a canvas context (or pre-computed text metrics) through the anchor calculation path so text measurement is available during transform application
- [x] 1.3 Add test cases for text centering: text with `anchor: "center"` and no `maxWidth` should visually center on its `(x, y)` point
- [x] 1.4 Verify the Riemann sums title text and the rotating square examples render correctly with the text dimension fix

## 2. Catalog system

- [x] 2.1 Create `lib/video/catalog.ts` with `defineCatalog()` that accepts a record of node type declarations (Zod prop schemas, slots, descriptions) and returns a catalog object
- [x] 2.2 Define catalog entries for all existing node types (`group`, `rect`, `text`, `math`, `functionGraph`, `parametricGraph`) using the existing Zod schemas from `lib/video/schema.ts`
- [x] 2.3 Implement `catalog.toPrompt(options)` that generates a system prompt string from the catalog — each node type gets a documentation section with props, types, constraints, slots, and description
- [x] 2.4 Implement Zod enum extraction in prompt generation so enum props (anchors, easings, text alignments) list their allowed values in the generated prompt
- [x] 2.5 Add a `catalog.getSchema()` method that returns the combined `videoDescriptionSchema` for use with AI SDK structured output
- [x] 2.6 Write unit tests for `defineCatalog()`: catalog creation, prompt generation idempotency, schema extraction, and that new entries appear in the generated prompt

## 3. Layout primitives — schema

- [x] 3.1 Add `center` node type to `lib/video/schema.ts`: `type: "center"`, `children` (max 1), optional `width`/`height`, base node properties, animate schema
- [x] 3.2 Add `stack` node type to `lib/video/schema.ts`: `type: "stack"`, `direction` (`z.enum(["vertical", "horizontal"])`), `gap` (non-negative number), optional `align` (`z.enum(["start", "center", "end"])`), `children` (min 1), base node properties, animate schema
- [x] 3.3 Add `align` node type to `lib/video/schema.ts`: `type: "align"`, `position` (one of nine anchor values), optional `padding` (non-negative number), `children` (max 1), base node properties, animate schema
- [x] 3.4 Add the three new types to the `videoNodeSchema` discriminated union
- [x] 3.5 Write schema validation tests: valid `center`/`stack`/`align` nodes pass; invalid configurations (center with 2 children, stack with bad direction, align with bad position) fail

## 4. Layout primitives — resolution

- [x] 4.1 Create `lib/video/layout.ts` with a `resolveLayout()` function that takes a scene's node tree and the frame dimensions, then computes absolute `(x, y)` positions for all layout-managed children
- [x] 4.2 Implement `center` resolution: child position = (containerWidth/2 - childWidth/2, containerHeight/2 - childHeight/2)
- [x] 4.3 Implement `stack` resolution: accumulate child dimensions + gap along the stack axis, apply cross-axis alignment
- [x] 4.4 Implement `align` resolution: position child so its corresponding anchor sits at the named position in the frame, inset by padding
- [x] 4.5 Handle nested layout composition: `resolveLayout` runs top-down, each layout node computes positions for its children before recursing
- [x] 4.6 Integrate layout resolution into the animation pipeline — call `resolveLayout` before `resolveSceneNodes` in `lib/video/animation.ts`
- [x] 4.7 Add layout node drawing to `lib/video/renderer.ts`: layout nodes draw like groups (iterate and draw children with computed transforms)
- [x] 4.8 Write unit tests for layout resolution: centered rect, vertical stack with gap, horizontal stack with alignment, align to all nine positions, nested layouts, absolute offset inside layout

## 5. Layout catalog entries

- [x] 5.1 Add `center`, `stack`, and `align` entries to the catalog definition with descriptions and prop schemas
- [x] 5.2 Verify `catalog.toPrompt()` includes documentation for the three new layout types

## 6. Visual validation

- [x] 6.1 Create `lib/video/visual-validation.ts` with `collectVisualWarnings()` that accepts a parsed `VideoDescription` and returns an array of warning objects (`{ nodeId, message, severity }`)
- [x] 6.2 Implement off-screen detection: compute bounding box from node position + anchor + dimensions; warn if box has zero intersection with frame
- [x] 6.3 Implement zero-dimension detection at frame 0: resolve animation values at local frame 0 and warn if effective width or height is zero
- [x] 6.4 Wire `collectVisualWarnings()` into the render pipeline (after Zod validation, before frame rendering), logging warnings without blocking rendering
- [x] 6.5 Write unit tests for visual validation: off-screen rect warns, partially visible rect passes, zero-dimension warns, valid scene produces no warnings

## 7. Replace hand-written prompt with catalog-generated prompt

- [x] 7.1 Replace `PROMPT_TO_VIDEO_SYSTEM_PROMPT` in `lib/ai/prompt-to-video-config.ts` with a call to `catalog.toPrompt()` passing canvas dimensions and fps
- [x] 7.2 Add a hand-written layout guidance section to the prompt that instructs the AI to prefer `center`/`stack`/`align` over raw pixel math for common patterns
- [x] 7.3 Remove the now-redundant `SUPPORTED_NODE_TYPES`, `SUPPORTED_PRIMITIVES`, `SUPPORTED_ANCHORS` constants that were only used for prompt construction
- [x] 7.4 Update `lib/actions/ai.ts` to use the catalog's schema for structured output instead of importing `videoDescriptionSchema` directly
- [x] 7.5 Update existing tests in `tests/ai/` to work with the catalog-generated prompt

## 8. Integration testing

- [x] 8.1 Run the "square fades in and rotates 360 degrees" prompt end-to-end and verify the square renders centered
- [x] 8.2 Run the "show me a graph of Riemann sums" prompt end-to-end and verify bars are aligned and the graph is visible
- [x] 8.3 Verify that existing test fixtures (sample-video-description) still render correctly after all changes
- [x] 8.4 Run `bun x ultracite check` and fix any lint/formatting issues
