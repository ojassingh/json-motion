## MODIFIED Requirements

### Requirement: Frame resolution is deterministic for a given scene description
The rendering pipeline SHALL resolve every requested frame from the validated scene description and frame index by first normalizing animation-object times, primitive shorthands, and shorthand transform aliases into a canonical frame-based representation, then producing one flat set of resolved node values for that frame without relying on browser state, wall-clock time, or random values.

#### Scenario: Re-rendering the same frame produces the same resolved values
- **WHEN** the renderer resolves frame 15 twice for the same validated video description that includes `"0.5s"` animation-object timings at 30 fps
- **THEN** it produces identical resolved transforms, visual properties, and draw ordering both times

### Requirement: The animation resolver applies transforms in a fixed composition order
The animation resolver SHALL convert animation-object times from seconds to frames using the video's `fps`, expand `primitives` into the same normalized animation-object form, merge them with explicit `animate` values so explicit values win on same-property conflicts, and resolve each animatable property for the current frame using the configured easing lookup. The resolved transform SHALL remain composited in this order: anchor translation, rotation, scale, skew, animated translation, and opacity.

#### Scenario: Slide and rotation use the documented transform order
- **WHEN** a node has a base rotation, a `SlideIn` primitive, and an explicit `animate.x` tuple on the same frame
- **THEN** the resolved transform applies the explicit tuple result with the documented composition order instead of an arbitrary renderer-specific order

### Requirement: Nodes render in stable z-order with recursive group traversal
For each frame, the rasterizer SHALL clear the active scene background using the resolved background color and draw nodes from lowest to highest resolved `zIndex`, using source order as the tie-breaker, and group nodes SHALL recursively render their children within the parent's resolved transform scope. The draw layer SHALL consume only resolved node values and SHALL not inspect authored `animate`, `primitives`, or nested position data directly.

#### Scenario: Overlapping siblings render predictably
- **WHEN** two sibling `rect` nodes overlap and the second node has a higher resolved `zIndex`
- **THEN** the higher `zIndex` node appears on top in the rendered frame

## ADDED Requirements

### Requirement: Color animations interpolate in OKLCH
The animation resolver SHALL interpolate `fill`, `stroke`, `color`, and scene `background` values in OKLCH space and return hex output for the resolved frame.

#### Scenario: Animated scene backgrounds use perceptual color interpolation
- **WHEN** a scene background animates from `#3b82f6` to `#f43f5e`
- **THEN** the intermediate resolved background color is computed through OKLCH interpolation instead of RGB channel interpolation
