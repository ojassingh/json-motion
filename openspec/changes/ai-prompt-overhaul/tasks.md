## 1. Catalog Node Descriptions

- [ ] 1.1 Rewrite `rect` description in `lib/ai/prompt-to-video-config.ts` to include educational use cases (bars, highlighted regions, neuron bodies, geometric areas) and mention animating `width`/`height` for growing effects
- [ ] 1.2 Rewrite `text` description to include educational use cases (equations, labels, step-by-step reveals) and note that `$$...$$` wrapping renders LaTeX
- [ ] 1.3 Rewrite `arrow` description to include force diagrams, connectors, flow indicators, and annotation callouts
- [ ] 1.4 Rewrite `stack` description to include use cases: vertical lists, side-by-side comparisons, equation term sequences
- [ ] 1.5 Rewrite `repeat` description to include use cases: neuron layers, particle grids, probability distributions, lattice structures
- [ ] 1.6 Rewrite `icon` description to explicitly restrict use: "Use ONLY for UI metaphors (checkmarks, UI arrows, social icons). Never use for scientific or educational concepts."

## 2. System Prompt — Canvas and Coordinate Section

- [ ] 2.1 Add a `## Canvas` section to `catalog.ts`'s `generatePrompt` with: origin at top-left, positive-y downward, 1920×1080 default, safe zones (title: y 60–150, content: y 200–880, footer: y 880–1080), and horizontal center x=960

## 3. System Prompt — Scene Recipes Section

- [ ] 3.1 Add a `## Scene Recipes` section to `generatePrompt` in `catalog.ts` with the following named recipes:
  - `LABELED_DIAGRAM`: central shape + surrounding arrow nodes + text labels at arrow tips
  - `STEP_BY_STEP_REVEAL`: multiple scenes, each adding one more text/equation node with prior nodes dimmed
  - `SIDE_BY_SIDE_COMPARISON`: horizontal stack with two centered groups, each labeled
  - `ANIMATED_DATA_GRID`: repeat macro with rect template + staggered opacity timeline
  - `MULTI_SCENE_LECTURE`: 2–3 scenes sharing a persistent title; each scene introduces one concept

## 4. System Prompt — Anti-Patterns Section

- [ ] 4.1 Add a `## Anti-Patterns` section to `generatePrompt` with these explicit prohibitions:
  - Icon nodes for domain concepts (atoms, neurons, waves, forces) — use rect/text/arrow instead
  - Manual center coordinates (x: 960, y: 540) — use `center` layout node
  - More than 8 visible nodes per scene — use multiple scenes
  - Scenes with no timeline animations — every scene must animate at least one property
  - Mixing domain-specific unsupported nodes — reinterpret with available primitives

## 5. User Prompt Wrapper

- [ ] 5.1 Rewrite `buildPromptToVideoUserPrompt` in `lib/ai/prompt-to-video-config.ts` to include a query interpretation step: identify the core concept → identify its visual representation → map to primitives → structure as 1–3 scenes
- [ ] 5.2 Add instruction: "If the concept involves multiple distinct ideas, use one scene per idea rather than cramming all ideas into one scene."
- [ ] 5.3 Add instruction: "If you cannot directly render a concept (e.g. a real photograph, a 3D object), reinterpret it as a labeled geometric abstraction."

## 6. Smoke Testing

- [ ] 6.1 Run `bun run scripts/prompt-to-video-smoke.ts` with at least 5 educational prompts: "show projectile motion", "explain a neural network", "derive E=mc²", "show Newton's three laws", "visualize the hydrogen atom"
- [ ] 6.2 For each result, manually verify: no icon nodes used for domain concepts, all nodes are within canvas bounds, at least one animation per scene, output makes visual sense for the prompt
