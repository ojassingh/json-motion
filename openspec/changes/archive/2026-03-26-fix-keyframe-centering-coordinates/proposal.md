## Why

The AI generates keyframe `x`/`y` values as if the canvas origin is at the center (e.g., `x: -500, y: -260` to mean "500px left of center"), but the renderer treats keyframe coordinates as canvas-absolute (origin at top-left). This causes animated nodes to render at the wrong position — typically stuck at the top-left corner or flying off-screen instead of starting centered and moving to a corner as intended.

## What Changes

- Update the catalog keyframe example in `lib/video/catalog.ts` to use canvas-absolute coordinates that match actual renderer behavior.
- Add explicit guidance in the catalog prompt clarifying that keyframe `x`/`y` are canvas-absolute (0,0 = top-left; width,height = bottom-right), not center-relative offsets.
- Add a worked example pattern for "start centered, animate to corner" showing the correct absolute coordinates.
- Remove the misleading example that shows large negative `x`/`y` values (which imply a center-origin coordinate system).

## Capabilities

### New Capabilities
<!-- None — this is a prompt/guidance fix, not a new capability -->

### Modified Capabilities
- `component-catalog`: The keyframe animation guidance and example in the catalog prompt are changing to correctly describe canvas-absolute coordinates for keyframe `x`/`y` values.

## Impact

- `lib/video/catalog.ts` — update `ANIMATION_GUIDANCE` constant and the keyframe example in `generateAnimationSection`
- `lib/ai/prompt-to-video-config.ts` — no changes required (uses the catalog)
- No schema or runtime behavior changes — this is a prompt-quality fix only
