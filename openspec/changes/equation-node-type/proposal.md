## Why

LaTeX equation rendering currently works via a magic string hack: the AI puts `$$...$$` around LaTeX inside a `text` node, and `resolveAiTextNode` in `lucide.ts` pattern-matches that to convert the text node into an icon node via MathJax. This approach fails in practice because: (1) the AI forgets or misuses the `$$...$$` delimiters, (2) "show me an equation" prompts fail silently when the delimiters are missing, (3) the `text` node description is the only hint that math is possible, buried in a footnote. A dedicated `equation` node with a `latex` prop makes the intent unambiguous to the AI and eliminates the entire magic-string resolution path.

## What Changes

- Add `equation` to the AI-facing schema as a new node type with required `latex` string and optional `size` (font size) and `color`
- `resolveAiEquationNode` in `lucide.ts` converts an `equation` node to an `icon` node (identical to what `resolveAiTextNode` does today for the `$$...$$` case) — the Rust engine requires no changes
- Remove the `$$...$$` pattern-match path from `resolveAiTextNode` (the hack is no longer needed)
- Add `equation` to the component catalog with a clear description and LaTeX syntax examples
- Update the AI-facing schema union to include the new node type
- Keep backward compatibility: existing saved videos using `text` with `$$...$$` still render correctly via a retained fallback in `resolveAiTextNode`

## Capabilities

### New Capabilities
- `equation-node`: A dedicated `type: "equation"` node that accepts a `latex` string and renders it via the existing MathJax → icon pipeline

### Modified Capabilities
- `math-node-rendering`: The equation node replaces the `$$...$$` text hack as the canonical way to render LaTeX; the spec is updated to reflect the `equation` node type name and `latex` prop

## Impact

- **Affected files**: `lib/video/schema.ts` (new Zod schema), `lib/video/lucide.ts` (new resolution function), `lib/ai/prompt-to-video-config.ts` (catalog entry), `lib/types/video.ts` (new type export)
- **No Rust engine changes** — the engine already renders icon nodes; equation nodes resolve to icon nodes before the engine sees them
- **No breaking changes** — existing `text` nodes with `$$...$$` continue to work via fallback
