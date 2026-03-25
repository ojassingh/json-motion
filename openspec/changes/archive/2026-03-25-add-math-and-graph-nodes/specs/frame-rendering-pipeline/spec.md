## MODIFIED Requirements

### Requirement: Nodes render in stable z-order with recursive group traversal
For each frame, the rasterizer SHALL clear the active scene background using the resolved background color and draw nodes from lowest to highest resolved `zIndex`, using source order as the tie-breaker, and group nodes SHALL recursively render their children within the parent's resolved transform scope. The draw layer SHALL consume only resolved node values and SHALL not inspect authored `animate`, `primitives`, or nested position data directly. The draw layer SHALL support `math`, `functionGraph`, and `parametricGraph` resolved node types in addition to the existing `group`, `rect`, `text`, and `image` types.

#### Scenario: Overlapping siblings render predictably
- **WHEN** two sibling `rect` nodes overlap and the second node has a higher resolved `zIndex`
- **THEN** the higher `zIndex` node appears on top in the rendered frame

#### Scenario: A math node renders in z-order alongside other node types
- **WHEN** a scene contains a rect node with `zIndex: 0` and a math node with `zIndex: 1`
- **THEN** the math node renders on top of the rect node

## ADDED Requirements

### Requirement: The frame rasterizer accepts pre-render caches for math and graph nodes
The `renderFrameToRgba` function SHALL accept an optional pre-render caches argument containing the math Skia image cache and the graph pixel point cache. When drawing math nodes, the rasterizer SHALL retrieve the cached Skia image. When drawing graph nodes, the rasterizer SHALL retrieve the cached pixel point array. If the caches argument is not provided, math and graph nodes SHALL be skipped gracefully.

#### Scenario: Math nodes draw from the cache without invoking MathJax
- **WHEN** a frame contains a math node and the pre-render cache contains its `(latex, color)` entry
- **THEN** the draw path retrieves the cached Skia image and draws it without any MathJax invocation

#### Scenario: Graph nodes draw from the cache without invoking mathjs
- **WHEN** a frame contains a functionGraph node and the pre-render cache contains its point array
- **THEN** the draw path retrieves the cached pixel points, clips by `drawProgress`, and strokes the path without any mathjs invocation

### Requirement: The animation resolver resolves new node types with type-specific properties
The animation resolver SHALL resolve `math` nodes with base transform properties plus `fontSize` and `color`. It SHALL resolve `functionGraph` and `parametricGraph` nodes with base transform properties plus `drawProgress`, `color`, and `strokeWidth`. All resolved values SHALL follow the same deterministic interpolation rules as existing node types.

#### Scenario: A functionGraph animates drawProgress from 0 to 1
- **WHEN** a functionGraph node has `animate: { drawProgress: { from: 0, to: 1, end: 60 } }` and the current local frame is 30
- **THEN** `drawProgress` resolves to approximately 0.75 (using the default `ease-out` easing)
