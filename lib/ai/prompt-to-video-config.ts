import { defineCatalog } from "@/lib/video/catalog";
import {
  DEFAULT_CANVAS_FPS,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_CANVAS_WIDTH,
} from "@/lib/video/config";
import {
  videoAiIconNodeSchema,
  videoAlignNodeSchema,
  videoAnchorSchema,
  videoCenterNodeSchema,
  videoEasingSchema,
  videoRectNodeSchema,
  videoStackNodeSchema,
  videoTextNodeSchema,
} from "@/lib/video/schema";

const DEFAULT_VIDEO_DIMENSIONS = {
  fps: DEFAULT_CANVAS_FPS,
  height: DEFAULT_CANVAS_HEIGHT,
  width: DEFAULT_CANVAS_WIDTH,
} as const;

export const PROMPT_TO_VIDEO_MODEL = "openai/gpt-5.4";

export const videoCatalog = defineCatalog({
  anchors: videoAnchorSchema,
  easings: videoEasingSchema,
  nodes: {
    align: {
      description:
        "Positions exactly one child at a named frame anchor with optional padding.",
      propSchema: videoAlignNodeSchema,
    },
    center: {
      description:
        "Centers exactly one child inside the frame or parent layout box.",
      propSchema: videoCenterNodeSchema,
    },
    icon: {
      description:
        "Renders a Lucide icon by name (see lucide.dev/icons). Use for symbolic visual accents. Specify `stroke` to colour the icon lines; omit `fill` unless you want a solid fill instead of an outline icon.",
      propSchema: videoAiIconNodeSchema,
    },
    rect: {
      description:
        "Rectangle shape with optional fill, stroke, and corner radius.",
      propSchema: videoRectNodeSchema,
    },
    stack: {
      description:
        "Lays out children in a vertical or horizontal sequence with automatic spacing.",
      propSchema: videoStackNodeSchema,
    },
    text: {
      description:
        "Renders a text string. Supports multiline with \\n. Defaults: color = #f8fafc, size = 48px, fontFamily = Inter, textAlign = left.",
      propSchema: videoTextNodeSchema,
    },
  },
});

export const PROMPT_TO_VIDEO_SYSTEM_PROMPT = videoCatalog.toPrompt(
  DEFAULT_VIDEO_DIMENSIONS
);

export const buildPromptToVideoUserPrompt = (prompt: string): string =>
  `
Create a polished but simple motion graphic from this request:
"${prompt}"

Pad the timeline: add roughly 1 second of delay before the first animation starts and 1 second of hold after the last animation ends. Space out transitions so they don't all fire immediately one after another — give each beat room to breathe.
Prefer semantic layout nodes over manual positioning: use \`center\`, \`align\`, and \`stack\`.
Keep root nodes simple and compose layouts by referencing child IDs in layout nodes.
Use \`dx\`/\`dy\` in the timeline for relative motion — avoid absolute coordinate math.
Keep all elements fully inside the canvas.
If the request implies unsupported media, reinterpret it as a stylized text-and-shape scene.
`.trim();
