import { defineCatalog } from "@/lib/video/catalog";
import {
  DEFAULT_CANVAS_FPS,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_CANVAS_WIDTH,
} from "@/lib/video/config";
import {
  videoAiEquationNodeSchema,
  videoAiIconNodeSchema,
  videoAlignNodeSchema,
  videoAnchorSchema,
  videoArrowNodeSchema,
  videoCenterNodeSchema,
  videoEasingSchema,
  videoRectNodeSchema,
  videoRepeatNodeSchema,
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
    arrow: {
      description:
        "Draws a straight arrow. Prefer `target` + `position` for callouts that should follow another node; use `from` + `to` for manual connectors or repeated arrows.",
      propSchema: videoArrowNodeSchema,
    },
    center: {
      description:
        "Centers exactly one child inside the frame or parent layout box.",
      propSchema: videoCenterNodeSchema,
    },
    equation: {
      description:
        "Renders a LaTeX mathematical expression. Use for equations, formulas, and mathematical notation. `latex` is the expression without surrounding `$$` delimiters. `size` controls the font size in pixels.",
      propSchema: videoAiEquationNodeSchema,
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
    repeat: {
      description:
        "Macro that repeats one leaf template in a 2D lattice. Use `rows`, `cols`, `rowStep`, and `colStep`. Omitted axes default to 0, so `{ y: 48 }` is valid. Best for grids, diagonal patterns, and repeated arrows. `template` should be a single `rect`, `text`, `icon`, or absolute `arrow`. Do not reference a `repeat` node from layout `children`; place it directly with `origin`.",
      propSchema: videoRepeatNodeSchema,
    },
    stack: {
      description:
        "Lays out children in a vertical or horizontal sequence with automatic spacing.",
      propSchema: videoStackNodeSchema,
    },
    text: {
      description:
        "Renders a text string. Supports multiline with \\n. Do not use `$$...$$` delimiters — use the `equation` node type for math. Defaults: color = #f8fafc, size = 48px, fontFamily = Inter, textAlign = left.",
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
When using \`repeat\`, place it with \`origin\` / \`rowStep\` / \`colStep\` instead of wrapping it in \`center\`, \`align\`, or \`stack\`.
Keep all elements fully inside the canvas.
If the request implies unsupported media, reinterpret it as a stylized text-and-shape scene.
`.trim();
