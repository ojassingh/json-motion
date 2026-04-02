## Context

The prompt-to-video pipeline calls `videoCatalog.toPrompt()` to generate the system prompt, then `buildPromptToVideoUserPrompt(prompt)` to wrap the user query. The system prompt auto-generates node documentation from the catalog schemas, but provides almost no guidance on *how to think* about a user's educational request. The catalog descriptions are one-liners. The user prompt wrapper adds six bullet points about layout preferences.

The model defaults to reaching for `icon` nodes (because Lucide icons are named, concrete, and feel specific) and produces scenes that are technically valid but educationally empty. It doesn't know that `repeat` can simulate a neural network layer, that `stack` + `text` nodes with staggered opacity timelines can simulate a step-by-step proof, or that a `rect` with animated `height` can show a bar chart growing.

## Goals / Non-Goals

**Goals:**
- The model reliably produces a meaningful scene for broad educational prompts without the user being highly specific
- The model never uses `icon` nodes to represent domain concepts
- The model understands the canvas coordinate system and produces layouts that are visually balanced on 1920×1080
- The model knows how to decompose multi-step educational content into multiple scenes

**Non-Goals:**
- Adding new node types (that is the scope of other PRs)
- Multi-agent prompt chaining
- Changing the structured output schema

## Decisions

**Expand catalog node descriptions to be educationally opinionated**

Instead of `"Rectangle shape with optional fill, stroke, and corner radius."`, the `rect` description should say something like: `"Rectangle shape. Use for bars in charts, highlighted regions, neuron bodies, force-diagram blocks, or any geometric area. Animate height/width for growing effects."` This gives the model intent signals, not just syntax.

**Add a `## Scene Recipes` section to the system prompt**

Named patterns that the model can pattern-match against user queries. Each recipe maps a concept to a concrete node composition. This is the single highest-leverage addition — it bridges "what does the user want" to "what primitives do I use."

Example recipes to include:
- `STEP-BY-STEP EQUATION REVEAL`: multiple scenes, each adding one more `text` node with LaTeX, previous nodes dimmed
- `LABELED DIAGRAM`: `rect` or shape node, `arrow` nodes pointing to it, `text` label nodes at arrow targets
- `COMPARISON SIDE-BY-SIDE`: `stack` with `direction: horizontal`, two `center` children, each containing a labeled group
- `DATA GRID`: `repeat` macro with `rect` template, staggered opacity timeline
- `ANIMATED SEQUENCE`: multiple scenes with a consistent background element, new content introduced each scene

**Add explicit anti-patterns section**

```
## Anti-Patterns (never do these)
- DO NOT use `icon` to represent domain concepts (atoms, neurons, stars, force vectors). Use rect/text/arrow.
- DO NOT manually compute center as x: 960, y: 540. Use the `center` layout node.
- DO NOT create more than 8 nodes per scene. Complexity should come from scenes, not crowded canvases.
- DO NOT omit timeline animations. Every scene must have at least one animated property.
```

**Rewrite the user prompt wrapper to include query interpretation**

Add a section that instructs the model to:
1. Identify the core concept in the query
2. Identify what that concept looks like visually (shapes, text, relationships)
3. Map those visuals to available primitives
4. Structure as 1–3 scenes where each scene makes one point

## Risks / Trade-offs

- **Risk**: More prompt tokens = higher latency/cost → **Mitigation**: measure token count after; the gain in output quality justifies moderate increase. Recipes are concise.
- **Risk**: Prescriptive recipes might constrain creative output → **Mitigation**: frame recipes as "when the query matches X, consider..." not "always do X"
- **Risk**: Prompt changes are hard to A/B test without infrastructure → **Mitigation**: run smoke tests on 10 representative educational queries before and after
