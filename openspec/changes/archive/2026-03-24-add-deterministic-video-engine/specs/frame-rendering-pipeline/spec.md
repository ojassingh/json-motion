## ADDED Requirements

### Requirement: Frame resolution is deterministic for a given scene description
The rendering pipeline SHALL resolve every requested frame from the validated scene description and frame index without relying on browser state, wall-clock time, or random values.

#### Scenario: Re-rendering the same frame produces the same resolved values
- **WHEN** the renderer resolves frame 24 twice for the same validated video description
- **THEN** it produces identical resolved transforms, opacity values, and draw ordering both times

### Requirement: The animation resolver applies transforms in a fixed composition order
The animation resolver SHALL combine a node's base transform and active animation values in this order: anchor translation, rotation, scale, skew, animated translation, and opacity.

#### Scenario: Slide and rotation use the documented transform order
- **WHEN** a node has a base rotation and an active slide-in effect on the same frame
- **THEN** the resolved transform applies the slide translation according to the documented composition order instead of an arbitrary renderer-specific order

### Requirement: Nodes render in stable z-order with recursive group traversal
For each frame, the rasterizer SHALL clear the active scene background and draw nodes from lowest to highest resolved `zIndex`, using source order as the tie-breaker, and group nodes SHALL recursively render their children within the parent's resolved transform scope.

#### Scenario: Overlapping siblings render predictably
- **WHEN** two sibling `rect` nodes overlap and the second node has a higher `zIndex`
- **THEN** the higher `zIndex` node appears on top in the rendered frame

### Requirement: The rasterizer outputs raw RGBA frame buffers
The rendering core SHALL rasterize each resolved frame into a raw RGBA buffer sized to the requested video width and height without writing intermediate PNG or JPEG files.

#### Scenario: A rendered frame returns a full-size RGBA buffer
- **WHEN** the renderer processes a 1920 by 1080 frame
- **THEN** it produces a raw RGBA buffer suitable for direct streaming into the encoder
