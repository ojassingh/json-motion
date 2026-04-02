## Context

The current LaTeX pipeline in `lucide.ts` has `resolveAiTextNode`, which checks if a text node's `text` field matches `^\s*\$\$([\s\S]+)\$\$\s*$`. If it does, it calls `latexToIcon(latex, { fontSize: node.size })` and returns a `VideoIconNode`. This works, but:
- The regex requires the *entire* `text` field to be LaTeX — you can't mix prose and math in one node (which the AI sometimes tries)
- The AI has to remember the `$$...$$` syntax rather than knowing to use `type: "equation"`
- The catalog description for `text` mentions math as a footnote

The `latexToIcon` function in `latex.ts` is solid and needs no changes. The MathJax pipeline (`tex2svg`, SVG path extraction, viewport normalization) is well-tested. The only change is at the schema and resolution layer.

## Goals / Non-Goals

**Goals:**
- AI generates `{ "type": "equation", "latex": "E = mc^2", "size": 64 }` instead of `{ "type": "text", "text": "$$E = mc^2$$", "size": 64 }`
- `equation` nodes resolve to `icon` nodes identically to the current text+`$$` path
- The Rust engine is unaffected (it continues to receive `icon` nodes)

**Non-Goals:**
- Inline math mixed with prose in a single node (out of scope; requires a different node type or renderer change)
- Term-level animation of individual equation glyphs (future work)
- Changing the MathJax rendering parameters

## Decisions

**Name the node `equation`, not `math`**

The existing specs use `math` as the node type name. However, a prior archived change (`add-math-and-graph-nodes`) already used `math` for a node that had `latex`, `fontSize`, `width`, `height` — designed for a different renderer that no longer exists. Using `equation` avoids collision with that spec's terminology and is more semantically clear to the AI (it's specifically for equations, not arbitrary math constructs).

**Keep resolution on the TS side, not in the Rust engine**

MathJax runs in Node.js. Converting LaTeX to SVG paths on the TS side before handing to the Rust engine is the existing pattern and remains correct. The Rust engine does not need to know about LaTeX.

**Retain `$$...$$` fallback in `resolveAiTextNode` for backward compatibility**

Any existing stored scenes with `text` nodes using `$$...$$` should still render. Remove the pattern from active prompt guidance, but keep the resolver fallback.

**`size` prop maps to MathJax `fontSize`**

Consistent with the current text node approach. The `latexToIcon` function already accepts `fontSize`.

## Risks / Trade-offs

- **Risk**: AI generates both `equation` and `text` nodes with `$$...$$` (double-renders) → **Mitigation**: catalog description for `text` explicitly says "do not use `$$..$$` — use `equation` node instead"
- **Risk**: `equation` size behaves differently from `text` size visually → **Mitigation**: both map to the same `fontSize` in `latexToIcon`; document expected visual behavior in catalog
- **Risk**: Forgetting to add `equation` to the discriminated union → **Mitigation**: Zod parse of `videoAiOutputSchema` will fail at generation time if any `equation` node is output but not in the union — caught immediately in tests
