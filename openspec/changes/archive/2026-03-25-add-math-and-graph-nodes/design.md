## Context

The motion renderer currently supports four node types (`rect`, `text`, `image`, `group`) rendered through a synchronous per-frame pipeline: `resolveFrame` → `drawResolvedNode` → canvas buffer. Image assets are loaded lazily on first draw and cached by `src` in a `Map<string, Promise<Image>>`. There is no explicit pre-render lifecycle — validation happens at the top of `renderVideo`, and everything else runs per-frame.

Adding math expressions and function graphs introduces two computationally expensive operations (MathJax SVG rendering and mathjs expression sampling) that must not run inside the frame loop. The design introduces a pre-render phase that runs once before the first frame, producing caches that the per-frame draw path reads from.

## Goals / Non-Goals

**Goals:**
- Add `math`, `functionGraph`, and `parametricGraph` node types to the schema, animation resolver, and renderer.
- Pre-render all heavy computation (MathJax tex2svg, mathjs sampling) once before the frame loop starts.
- Keep the frame loop reading exclusively from caches — zero MathJax or mathjs calls per frame.
- Maintain 100% type safety with no type casts.
- Keep the code simple, readable, and consistent with existing patterns.
- Update the AI system prompt so the model can generate scenes using the new nodes.
- Add a real (non-mocked) integration test that calls the AI and validates the output renders without errors.

**Non-Goals:**
- Interactive or editable math — this is a video renderer, not a live editor.
- Arbitrary JavaScript evaluation — `mathjs` provides a sandboxed expression evaluator, never `eval`.
- 3D graphs, polar coordinates, or implicit equations.
- Streaming or incremental MathJax rendering.
- Color tinting of math SVGs at the Skia layer — pre-render per unique `(latex, color)` pair instead.

## Decisions

### 1. MathJax over KaTeX for LaTeX rendering

**Choice:** `mathjax-full` with its Node.js `tex2svg` adapter.

**Why:** KaTeX's SVG output is incomplete and not officially supported — it was never fully implemented. KaTeX relies on HTML+CSS layout and web fonts for rendering. MathJax 3 was rewritten specifically to produce clean, self-contained SVG server-side with no browser dependency. This produces a single SVG string that skia-canvas can load directly.

**Alternative considered:** KaTeX — rejected because its SVG path was never fully implemented and produces incomplete output that depends on external CSS/fonts.

### 2. mathjs for expression evaluation

**Choice:** `mathjs` `compile` + `evaluate` for both `functionGraph` and `parametricGraph`.

**Why:** mathjs provides a safe, sandboxed expression evaluator with no access to the file system or network. It supports a wide math syntax (trig, log, pow, etc.) out of the box. The `compile` step creates a reusable evaluator, and `evaluate` is fast for repeated calls with different variable bindings.

**Alternative considered:** `eval()` or `new Function()` — rejected for security and sandboxing reasons.

### 3. Pre-render lifecycle as an explicit phase

**Choice:** A `preRenderVideo` function in `lib/video/pre-render.ts` that runs sequentially: scan scene tree → pre-render math → pre-sample graphs. It returns cache objects that the frame generator passes into `renderFrameToRgba`.

**Why:** The existing `renderVideo` has no pre-render phase — validation → frame loop. Adding an explicit step keeps the frame loop clean and makes it obvious that MathJax/mathjs never run per-frame. The cache objects are passed as arguments rather than module-level singletons, keeping functions testable and avoiding shared mutable state.

**Alternative considered:** Lazy per-frame caching (like `loadVideoImage`) — rejected because MathJax `tex2svg` is synchronous and heavy (~50-200ms per expression). Lazy caching would cause frame 0 to be orders of magnitude slower than subsequent frames, breaking the deterministic performance model.

### 4. Cache keyed by `(latex, color)` for math nodes

**Choice:** The math pre-render cache uses `${latex}::${color}` as the key, producing one Skia Image per unique combination.

**Why:** Math SVGs embed their fill color directly in the SVG markup. Changing color requires re-rendering the SVG. Since the typical scene has a small number of unique latex+color combinations (single digits), pre-rendering all combinations is cheap and avoids per-frame color manipulation.

### 5. Graph sampling strategy

**Choice:** `functionGraph` samples `N = node width in pixels` points across `xRange`. `parametricGraph` samples 500 points across `tRange` by default. Both store pixel-coordinate arrays.

**Why:** For function graphs, one sample per pixel is the minimum needed for a smooth curve at the target resolution. For parametric graphs, the curve doesn't map linearly to pixel width, so a fixed sample count (500) provides good quality for typical curves. Both compute once and store pixel arrays that the draw path iterates with `moveTo`/`lineTo`.

### 6. drawProgress animation for graph nodes

**Choice:** Both graph types support a `drawProgress` animatable property (0 = nothing visible, 1 = full curve). The draw path clips the point array to `Math.floor(points.length * drawProgress)`.

**Why:** Animated curve drawing is the primary visual use case. `drawProgress` maps directly to a simple array slice, making it frame-loop-friendly. The AI can animate it with the standard `animate` block: `{ from: 0, to: 1, end: 60 }`.

### 7. Pass pre-render caches as function arguments

**Choice:** `renderFrameToRgba` accepts an optional `PreRenderCaches` argument. `createFrameStream` in `render-video.ts` calls `preRenderVideo` once and passes the result to every frame call.

**Why:** This avoids module-level mutable state and keeps the renderer testable. When no caches are provided (e.g. scenes without math/graph nodes), the draw path simply skips the cache lookup and behaves as before.

## Risks / Trade-offs

- **`mathjax-full` is a large dependency (~15 MB)** → Acceptable for a server-side video renderer. It is not bundled into the client. If size becomes an issue, it can be loaded dynamically only when math nodes are present.
- **MathJax initialization is slow on first call (~200ms)** → The pre-render phase absorbs this cost once before the frame loop. Subsequent calls within the same process reuse MathJax's internal caches.
- **mathjs `compile` could throw on invalid expressions** → The pre-sample phase wraps compilation in try-catch and throws a clear `PRERENDER_ERROR` with the offending expression. Validation at the schema level cannot catch semantic math errors, so this is a runtime check.
- **Very large LaTeX expressions could produce huge SVGs** → No hard limit imposed initially. If needed, a max-SVG-size check can be added to the pre-render phase.
- **Graph nodes with extreme ranges (e.g., `xRange: [-1e10, 1e10]`) could produce NaN or Infinity** → The sampling function clamps evaluated values to `yRange` and skips `NaN`/`Infinity` points, leaving gaps in the curve.
