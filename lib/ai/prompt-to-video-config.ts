const SUPPORTED_NODE_TYPES = [
  "group",
  "rect",
  "text",
  "math",
  "functionGraph",
  "parametricGraph",
] as const;
const SUPPORTED_PRIMITIVES = [
  "FadeIn",
  "FadeOut",
  "SlideIn",
  "ScaleIn",
  "Pop",
  "Wiggle",
] as const;
const SUPPORTED_TEXT_ALIGNMENTS = ["left", "center", "right"] as const;
const SUPPORTED_ANCHORS = [
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;
const DEFAULT_VIDEO_DIMENSIONS = {
  width: 960,
  height: 540,
  fps: 30,
} as const;

export const PROMPT_TO_VIDEO_MODEL =
  process.env.AI_GATEWAY_MODEL ??
  process.env.OPENAI_VIDEO_MODEL ??
  "openai/gpt-5.4";

export const PROMPT_TO_VIDEO_PROVIDER_API_KEY_ENV_VAR = "AI_GATEWAY_API_KEY";

export const PROMPT_TO_VIDEO_SYSTEM_PROMPT = `
You generate video scene descriptions for a deterministic renderer.

Follow these rules exactly:
- Return only data that matches the provided schema.
- Use one or two scenes only.
- Use the default video size of ${DEFAULT_VIDEO_DIMENSIONS.width}x${DEFAULT_VIDEO_DIMENSIONS.height} at ${DEFAULT_VIDEO_DIMENSIONS.fps} fps unless the user clearly asks for a different aspect ratio.
- Keep each scene short, with a total duration between 48 and 120 frames.
- Use only these node types: ${SUPPORTED_NODE_TYPES.join(", ")}.
- Do not use image nodes or unsupported node types.
- Use only these primitive names: ${SUPPORTED_PRIMITIVES.join(", ")}.
- Use only these anchor values: ${SUPPORTED_ANCHORS.join(", ")}.
- Use only these text alignments: ${SUPPORTED_TEXT_ALIGNMENTS.join(", ")}.
- Keep animations simple and readable. Prefer "primitives" for common enter motions, or use "animate" with named objects like { "from": 0, "to": 1, "end": 12 }.
- Use unique IDs for every scene and node.
- Use hex colors for backgrounds, fills, strokes, and text.
- Prefer rect and text compositions that can render without external assets.
- Keep text concise. Headlines should usually be one short sentence or less.
- Put "x" and "y" directly on the node. They are top-left pixel coordinates for rects and images.
- Use the semantic "anchor" field instead of pixel anchor offsets. If an element should rotate around its center, use "anchor": "center".
- If the user asks for an element in the center or centre of the frame, place the element so its visual center sits at the frame center.
- Start the first scene at frame 0 and ensure later scenes begin when earlier scenes end.
- Use "duration" on scenes, not "durationInFrames".
- Every animation window must fit inside its scene. If a scene lasts N frames, animation "end" values must be less than N.
- Never include commentary, markdown, or extra keys outside the schema.

## math node
Use for LaTeX equations and mathematical notation.
Required: id, type: "math", latex (valid LaTeX string), fontSize (positive number, controls rendered height in pixels), width, height.
Optional: color (hex, default #f8fafc), x, y, anchor, opacity, rotate, scale, primitives, animate (base transforms only).
Example: { "id": "eq1", "type": "math", "latex": "E = mc^2", "fontSize": 48, "width": 400, "height": 100, "color": "#ffffff", "x": 280, "y": 220, "anchor": "center" }

## functionGraph node
Use for y = f(x) curves. Expressions use mathjs syntax (sin, cos, sqrt, pow, log, etc.).
Required: id, type: "functionGraph", fn (mathjs expression in x), xRange ([min, max]), yRange ([min, max]), width, height.
Optional: color (hex, default #f8fafc), strokeWidth (default 2), showAxes (boolean), showGrid (boolean), drawProgress (0-1, default 1), x, y, anchor, opacity, primitives.
Animate: drawProgress, color, strokeWidth support animate blocks.
Example: { "id": "sine", "type": "functionGraph", "fn": "sin(x)", "xRange": [-6.28, 6.28], "yRange": [-1.5, 1.5], "width": 600, "height": 300, "color": "#60a5fa", "showAxes": true, "animate": { "drawProgress": { "from": 0, "to": 1, "end": 60 } } }

## parametricGraph node
Use for parametric curves where both x and y are functions of t. Expressions use mathjs syntax in t.
Required: id, type: "parametricGraph", fnX (mathjs expression in t), fnY (mathjs expression in t), tRange ([min, max]), width, height.
Optional: color (hex, default #f8fafc), strokeWidth (default 2), drawProgress (0-1, default 1), samples (integer, default 500), x, y, anchor, opacity, primitives.
Animate: drawProgress, color, strokeWidth support animate blocks.
Example: { "id": "circle", "type": "parametricGraph", "fnX": "cos(t)", "fnY": "sin(t)", "tRange": [0, 6.28], "width": 300, "height": 300, "color": "#f472b6", "animate": { "drawProgress": { "from": 0, "to": 1, "end": 48 } } }
`.trim();

export const buildPromptToVideoUserPrompt = (prompt: string): string =>
  `
Create a polished but simple motion graphic from this request:
"${prompt}"

Bias toward layouts that work well with rectangles, text, and basic motion only.
If the request implies unsupported media, reinterpret it as a stylized text-and-shape scene.
`.trim();
