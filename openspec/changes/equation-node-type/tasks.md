## 1. Schema (lib/video/schema.ts)

- [x] 1.1 Add `videoAiEquationNodeSchema` with required `latex: z.string()`, optional `size: z.number().positive()`, optional `color: z.string()`, and all base transform fields
- [x] 1.2 Add `VideoAiEquationNode` type extracted from the schema
- [x] 1.3 Add `"equation"` to the `videoAiNodeSchema` discriminated union so it is valid in AI output
- [x] 1.4 Do NOT add `equation` to the engine-facing `videoNodeSchema` — the engine never sees it

## 2. Resolution (lib/video/lucide.ts)

- [x] 2.1 Add `resolveAiEquationNode(node: VideoAiEquationNode): VideoIconNode` that calls `latexToIcon(node.latex, { fontSize: node.size ?? 48 })` and maps the result to a `VideoIconNode` with `fill: node.color ?? DEFAULT_TEXT_COLOR` and `strokeWidth: 0`
- [x] 2.2 Update `resolveAiSceneNodes` to call `resolveAiEquationNode` for nodes with `type === "equation"`
- [x] 2.3 Keep the existing `$$...$$` detection in `resolveAiTextNode` as a backward-compat fallback — do not remove it

## 3. Types (lib/types/video.ts)

- [x] 3.1 Export `VideoAiEquationNode` type

## 4. Catalog (lib/ai/prompt-to-video-config.ts)

- [x] 4.1 Add `equation` entry to `videoCatalog` in `defineCatalog` call with description: "Renders a LaTeX mathematical expression. Use for equations, formulas, and mathematical notation. `latex` is the expression without surrounding `$$` delimiters. `size` controls the font size in pixels."
- [x] 4.2 Update the `text` node description to add: "Do not use `$$...$$` delimiters — use the `equation` node type for math."
- [x] 4.3 Import and pass `videoAiEquationNodeSchema` as the `propSchema` for the `equation` catalog entry

## 5. Tests (lib/video/lucide.test.ts)

- [x] 5.1 Add a test: `resolveAiSceneNodes` converts an `equation` node to an icon node with path elements, correct fill, and non-zero dimensions
- [x] 5.2 Add a test: an `equation` node with malformed LaTeX throws during resolution
- [x] 5.3 Verify existing test "resolves display latex text nodes into icon nodes" still passes (backward compat)

## 6. Smoke Test

- [ ] 6.1 Run a prompt-to-video smoke test with "show me the quadratic formula" and verify the output scene contains an icon node (resolved from equation) with SVG path elements — not a raw text node
