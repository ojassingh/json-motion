import { defineCatalog } from "@/lib/video/catalog";
import {
  DEFAULT_CANVAS_FPS,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_CANVAS_WIDTH,
} from "@/lib/video/config";
import {
  videoAlignNodeSchema,
  videoAnchorSchema,
  videoCenterNodeSchema,
  videoEasingSchema,
  videoFunctionGraphNodeSchema,
  videoGroupNodeSchema,
  videoMathNodeSchema,
  videoParametricGraphNodeSchema,
  videoPrimitiveSchema,
  videoRectNodeSchema,
  videoStackNodeSchema,
  videoTextNodeSchema,
} from "@/lib/video/schema";

const DEFAULT_VIDEO_DIMENSIONS = {
  fps: DEFAULT_CANVAS_FPS,
  height: DEFAULT_CANVAS_HEIGHT,
  width: DEFAULT_CANVAS_WIDTH,
} as const;

export const PROMPT_TO_VIDEO_MODEL =
  process.env.AI_GATEWAY_MODEL ??
  process.env.OPENAI_VIDEO_MODEL ??
  "openai/gpt-5.4";

export const videoCatalog = defineCatalog({
  anchors: videoAnchorSchema,
  easings: videoEasingSchema,
  nodes: {
    align: {
      description:
        "Positions its single child relative to a named edge or corner of the frame. Use for titles, watermarks, or any element that should stay anchored to a frame edge.",
      propSchema: videoAlignNodeSchema,
      slots: ["children"],
    },
    center: {
      description:
        "Centers its single child within the frame. Use whenever an element should appear in the middle of the screen.",
      propSchema: videoCenterNodeSchema,
      slots: ["children"],
    },
    functionGraph: {
      description:
        "Renders a y = f(x) curve. Expressions use mathjs syntax (sin, cos, sqrt, pow, log, etc.). Use the DrawIn primitive to animate the graph drawing progressively.",
      propSchema: videoFunctionGraphNodeSchema,
      slots: [],
    },
    group: {
      description:
        "Container that groups child nodes under a shared transform. Use for animating multiple elements together.",
      propSchema: videoGroupNodeSchema,
      slots: ["children"],
    },
    math: {
      description: "Renders a LaTeX equation. Use for mathematical notation.",
      propSchema: videoMathNodeSchema,
      slots: [],
    },
    parametricGraph: {
      description:
        "Renders a parametric curve where x and y are both functions of t. Expressions use mathjs syntax in t. Use the DrawIn primitive to animate the graph drawing progressively.",
      propSchema: videoParametricGraphNodeSchema,
      slots: [],
    },
    rect: {
      description:
        "Rectangle shape with optional fill color, stroke, and corner radius. The most common building block for motion graphics.",
      propSchema: videoRectNodeSchema,
      slots: [],
    },
    stack: {
      description:
        "Arranges multiple child nodes in a vertical or horizontal sequence with automatic spacing. Use for lists, bar charts, or any repeating sequence of elements.",
      propSchema: videoStackNodeSchema,
      slots: ["children"],
    },
    text: {
      description:
        "Renders a text string. Supports multiline text with \\n. Defaults: color = #f8fafc, size = 48px, fontFamily = Inter, textAlign = left.",
      propSchema: videoTextNodeSchema,
      slots: [],
    },
  },
  primitives: videoPrimitiveSchema,
});

export const PROMPT_TO_VIDEO_SYSTEM_PROMPT = videoCatalog.toPrompt(
  DEFAULT_VIDEO_DIMENSIONS
);

export const buildPromptToVideoUserPrompt = (prompt: string): string =>
  `
Create a polished but simple motion graphic from this request:
"${prompt}"

Bias toward layouts that work well with rectangles, text, and basic motion only.
If the request implies unsupported media, reinterpret it as a stylized text-and-shape scene.
`.trim();
