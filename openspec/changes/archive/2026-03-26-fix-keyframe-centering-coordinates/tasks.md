## 1. Fix the keyframe coordinate system guidance in the catalog prompt

- [x] 1.1 In `lib/video/catalog.ts`, update the `ANIMATION_GUIDANCE` section to add a sentence explicitly stating that keyframe `x`/`y` values are canvas-absolute coordinates (0,0 = top-left corner; positive x goes right, positive y goes down)
- [x] 1.2 Replace the misleading example keyframe in `generateAnimationSection` — change `x: -420, y: -220` to realistic on-screen canvas-absolute values, adding inline comments that explain what the numbers represent (e.g., "near top-left corner on a 1280×720 canvas")
- [x] 1.3 Add a second annotated keyframe example that shows the "start centered via `center` node, animate to a corner" pattern with correct absolute target coordinates

## 2. Verify correctness

- [x] 2.1 Run `bun x ultracite check` to confirm no lint/format issues introduced
- [x] 2.2 Manually review the generated prompt string (e.g., via a quick test or `console.log`) to confirm the new coordinate guidance and examples are present and read clearly
