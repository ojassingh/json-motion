## ADDED Requirements

### Requirement: The user prompt wrapper instructs the model to decompose educational intent into primitives
The `buildPromptToVideoUserPrompt` function SHALL include a query interpretation section that instructs the model to: (1) identify the core concept in the user's request, (2) identify what that concept looks like visually (shapes, text, spatial relationships), (3) map those visual elements to available primitives, and (4) structure the output as 1–3 scenes where each scene makes one clear point.

#### Scenario: A vague educational prompt produces a meaningful scene
- **WHEN** the user prompt is "explain projectile motion"
- **THEN** the model produces a scene with labeled geometric shapes (a rect or path representing trajectory), text annotations for variables (v0, θ, g), and arrows for force vectors — not empty icon nodes or a blank canvas

#### Scenario: An unsupported concept is reinterpreted using available primitives
- **WHEN** the user prompt is "show a neural network"
- **THEN** the model uses `repeat` for neuron layers (rect nodes in a grid), `arrow` nodes for connections between layers, and `text` for layer labels — not icons named "brain" or "network"

### Requirement: The system prompt includes named scene recipes for common educational patterns
The system prompt SHALL include a `## Scene Recipes` section containing at minimum 5 named patterns. Each recipe SHALL map a common educational concept to a specific node composition using only currently supported primitives. Recipe names SHALL be in ALL_CAPS for easy model pattern-matching.

#### Scenario: The model uses the LABELED DIAGRAM recipe for a physics force diagram
- **WHEN** the user asks "show Newton's second law with a force diagram"
- **THEN** the model generates a rect (the object), arrow nodes pointing toward it (forces), and text label nodes at each arrow — matching the LABELED DIAGRAM recipe structure

#### Scenario: The model uses the STEP-BY-STEP REVEAL recipe for an equation derivation
- **WHEN** the user asks "derive kinetic energy from work-energy theorem"
- **THEN** the model uses multiple scenes where each scene reveals the next step of the derivation, with prior steps visible but dimmed

### Requirement: The system prompt explicitly prohibits using icon nodes for domain concepts
The system prompt SHALL include an anti-patterns section that states: icon nodes are reserved for UI metaphors only (checkmarks, arrows-as-decorations, social icons). The prompt SHALL explicitly state that scientific, mathematical, and educational concepts (atoms, neurons, waves, forces, graphs, particles) MUST be expressed using rect, text, arrow, stack, or repeat nodes — never icon nodes.

#### Scenario: The model avoids icons for a quantum mechanics prompt
- **WHEN** the user asks "visualize a hydrogen atom"
- **THEN** the model uses rect or circle-approximating constructs and text labels — not an icon named "atom" or "circle"

### Requirement: The system prompt documents the canvas coordinate system and common safe zones
The system prompt SHALL state that: (1) the canvas origin is at the top-left corner, (2) positive x goes right, positive y goes down, (3) the canvas is 1920×1080 by default. It SHALL include a table or list of common safe-zone coordinates: horizontal center (960), vertical center (540), typical title region (top 200px), typical content region (200–880px), typical footer region (880–1080px).

#### Scenario: The model places a title in the title region
- **WHEN** the user asks for an educational slide with a title
- **THEN** the model uses an `align` node with `position: "top-center"` or places a text node in the y range 60–150, not at y: 540

### Requirement: The system prompt caps scene complexity to prevent crowded layouts
The system prompt SHALL instruct the model that each scene should contain no more than 6–8 visible nodes. It SHALL instruct the model to use multiple scenes instead of crowding one scene, and to carry over only persistent elements (like a title) between scenes via consistent node IDs and opacity.

#### Scenario: A multi-concept prompt uses multiple scenes
- **WHEN** the user asks "explain the three laws of motion"
- **THEN** the model produces three scenes (one per law) with 4–6 nodes each, rather than a single crowded scene with 15+ nodes
