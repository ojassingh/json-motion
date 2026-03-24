const SUPPORTED_NODE_TYPES = ["group", "rect", "text"] as const;
const SUPPORTED_EFFECTS = ["fade-in", "scale-in", "slide-in"] as const;
const SUPPORTED_TEXT_ALIGNMENTS = ["left", "center", "right"] as const;
const DEFAULT_VIDEO_DIMENSIONS = {
  width: 960,
  height: 540,
  fps: 12,
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
- Use only these effect names: ${SUPPORTED_EFFECTS.join(", ")}.
- Use only these text alignments: ${SUPPORTED_TEXT_ALIGNMENTS.join(", ")}.
- Keep animations simple and readable. Prefer fade-in, scale-in, slide-in, or short keyframe motions.
- Use unique IDs for every scene and node.
- Use hex colors for backgrounds, fills, strokes, and text.
- Prefer rect and text compositions that can render without external assets.
- Keep text concise. Headlines should usually be one short sentence or less.
- Start the first scene at frame 0 and ensure later scenes begin when earlier scenes end.
- Every animation frame window must fit inside its scene. If a scene lasts N frames, animation endFrame values must be less than N.
- Never include commentary, markdown, or extra keys outside the schema.
`.trim();

export const buildPromptToVideoUserPrompt = (prompt: string): string =>
  `
Create a polished but simple motion graphic from this request:
"${prompt}"

Bias toward layouts that work well with rectangles, text, and basic motion only.
If the request implies unsupported media, reinterpret it as a stylized text-and-shape scene.
`.trim();
