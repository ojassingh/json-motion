## Context

The AI video generation pipeline uses a catalog-driven system prompt (`lib/video/catalog.ts`) to instruct the LLM on how to produce valid video scene JSON. The catalog includes an example keyframe animation snippet that shows `x: -420, y: -220` as target coordinates. The renderer uses a canvas-absolute coordinate system (0,0 = top-left corner). As a result, the LLM has learned to treat the canvas center as the coordinate origin, producing negative x/y values for "upper-left" positions and values like `x: -500, y: -260` — which the renderer places off-screen.

The fix is confined to the prompt text in `catalog.ts`. The renderer and schema are correct; the problem is solely misleading documentation in the system prompt.

## Goals / Non-Goals

**Goals:**
- Correct the keyframe example so it uses realistic canvas-absolute coordinates
- Add a sentence explicitly stating the coordinate system (0,0 = top-left, positive x/y go right/down)
- Add a worked "start centered, animate to corner" example that shows the correct pattern

**Non-Goals:**
- Changing the renderer or animation engine coordinate system
- Changing how `center` layout nodes interact with keyframe animations
- Any schema changes

## Decisions

**Decision: Fix prompt only, not the coordinate system**

Two options were considered:
1. Change keyframe `x`/`y` semantics to be offsets from the layout-resolved position (center-relative when inside a `center` node)
2. Fix the prompt to correctly describe the existing canvas-absolute system

Option 2 is chosen because:
- Option 1 is a breaking change to the animation engine and all existing video descriptions
- The existing system is internally consistent — `center` nodes set a static layout position, and keyframes animate to canvas-absolute coordinates
- The bug is purely a documentation/example problem, not a design flaw

**Decision: Replace the abstract `-420, -220` example with a concrete "center → corner" pattern**

The existing example shows coordinates with no explained relationship to the canvas. Replacing it with an annotated example that ties coordinates to the canvas dimensions (1280×720) makes the expected values unambiguous to the LLM.

## Risks / Trade-offs

- [Risk] Existing AI-generated videos that relied on the broken behavior may look different → Acceptable: those videos were already rendering incorrectly.
- [Risk] Prompt change may degrade other aspects of generation if the model over-indexes on the new example → Mitigation: keep the example minimal and general, not overly prescriptive.

## Migration Plan

No migration needed. The prompt change takes effect for all new generation requests immediately. Existing saved video descriptions are unaffected.
