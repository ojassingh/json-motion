## ADDED Requirements

### Requirement: The render entry point executes a pre-render phase before the frame loop
The `renderVideo` function SHALL execute a pre-render phase after schema validation and before the frame loop. The pre-render phase SHALL run in this order: (1) preload image assets for all Image nodes, (2) pre-render math expressions for all Math nodes into a Skia image cache, (3) pre-sample graph functions for all FunctionGraph and ParametricGraph nodes into pixel point caches. All three steps SHALL complete before the first frame is rasterized.

#### Scenario: Pre-render completes before frame iteration begins
- **WHEN** a video description contains image, math, and functionGraph nodes
- **THEN** all image assets are loaded, all math SVGs are rasterized to Skia images, and all graph points are sampled before the first frame buffer is produced

#### Scenario: Scenes with no math or graph nodes skip those pre-render steps
- **WHEN** a video description contains only rect and text nodes
- **THEN** the pre-render phase completes without invoking MathJax or mathjs, and the frame loop proceeds as before

### Requirement: Pre-render caches are passed to the frame rasterizer as arguments
The pre-render phase SHALL return cache objects (math image cache and graph point cache) that are passed as arguments to the per-frame rasterizer. The caches SHALL NOT be stored as module-level mutable state.

#### Scenario: Each frame receives the same cache references
- **WHEN** the frame loop renders 60 frames of a scene with math and graph nodes
- **THEN** every frame call receives the same cache objects produced by the single pre-render invocation

### Requirement: Pre-render errors halt rendering before any frame is produced
If any step of the pre-render phase fails (invalid LaTeX, invalid math expression, asset load failure), the system SHALL throw an error with an appropriate error code (`PRERENDER_ERROR` or `ASSET_LOAD_ERROR`) before producing any frame buffers or invoking the encoder.

#### Scenario: A math pre-render failure prevents frame production
- **WHEN** a math node contains invalid LaTeX that MathJax cannot render
- **THEN** `renderVideo` throws a `PRERENDER_ERROR` and no frames are sent to the encoder
