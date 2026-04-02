## Why

The current AI system prompt is too sparse to reliably produce meaningful educational animations. Prompts like "show me a projectile motion lecture" result in the AI inventing unsupported icon nodes, generating abstract shapes with no semantic meaning, or producing technically valid but visually meaningless output. The AI lacks: (1) named recipes for common educational scenarios, (2) explicit anti-patterns with consequences, (3) spatial reasoning guidance for the 1920×1080 canvas, and (4) enough reinforcement of what the available primitives can actually accomplish. The user prompt wrapper is also too thin — it doesn't give the model enough context to translate vague educational intent into a concrete composition.

## What Changes

- **System prompt overhaul**: Replace the current minimal prompt with a richly-documented prompt that includes domain-specific recipes, explicit anti-patterns, spatial layout guidance, and examples showing how to compose existing primitives into educational scenes
- **User prompt wrapper enhancement**: Expand `buildPromptToVideoUserPrompt` to include query interpretation guidance — explicitly telling the model how to decompose "show me X" into nodes, what to do when a concept isn't directly renderable, and how to structure a multi-scene educational sequence
- **Anti-icon enforcement**: Add explicit, firm instruction that icons are only for UI metaphors — not domain concepts like "atoms", "neurons", "force vectors". Domain concepts must be expressed with geometry (rect, text, arrows) or math
- **Coordinate system clarity**: Document the canvas coordinate system (0,0 top-left, positive y downward) and common safe zones for 1920×1080
- **Recipe catalog in prompt**: Add 5–7 named "scene recipes" showing how to compose existing primitives for: (a) step-by-step equation reveal, (b) labeled diagram, (c) side-by-side comparison, (d) animated text highlight sequence, (e) data grid / repeat pattern

## Capabilities

### New Capabilities
- `prompt-interpretation-guidance`: The user prompt wrapper teaches the model to decompose educational intent into available primitives, handle unsupported concepts gracefully, and structure multi-scene sequences

### Modified Capabilities
- `prompt-to-video-api`: The system prompt gains educational recipes, anti-patterns, spatial guidance, and stronger icon-avoidance rules

## Impact

- **Affected files**: `lib/ai/prompt-to-video-config.ts` (system prompt + user prompt wrapper), `lib/video/catalog.ts` (description strings for each node type)
- **No schema changes**, no engine changes, no breaking API changes
- **Immediately testable**: prompt changes can be evaluated by running smoke tests against real user queries
