import { defineCatalog } from "@/lib/video/catalog";
import {
  DEFAULT_CANVAS_FPS,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_CANVAS_WIDTH,
} from "@/lib/video/config";
import {
  videoAiEquationNodeSchema,
  videoAiFunctionGraphNodeSchema,
  videoAiIconNodeSchema,
  videoAiParametricGraphNodeSchema,
  videoAlignNodeSchema,
  videoAnchorSchema,
  videoCenterNodeSchema,
  videoCircleNodeSchema,
  videoEasingSchema,
  videoLineNodeSchema,
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
    circle: {
      description:
        "Renders a circle or ellipse. Use for neurons, atoms, Venn diagram regions, orbits, or any round shape. Animate `drawProgress` from 0 to 1 to draw the circle stroke progressively.",
      propSchema: videoCircleNodeSchema,
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
    functionGraph: {
      description:
        "Plots y=f(x) for a mathematical function. `fn` is a mathjs expression in `x`. Use for sine waves, parabolas, exponentials, and any y=f(x) curve. Animate `drawProgress` from 0 to 1 to draw the curve progressively. Set `showAxes: true` to render axis lines.",
      propSchema: videoAiFunctionGraphNodeSchema,
    },
    icon: {
      description:
        "Renders a Lucide icon by name (see lucide.dev/icons). Use for symbolic visual accents. Specify `stroke` to colour the icon lines; omit `fill` unless you want a solid fill instead of an outline icon.",
      propSchema: videoAiIconNodeSchema,
    },
    parametricGraph: {
      description:
        "Plots a parametric curve `(fnX(t), fnY(t))`. Use for circles, spirals, Lissajous figures, and curves that cannot be expressed as y=f(x). Both `fnX` and `fnY` must be mathjs expressions in `t`.",
      propSchema: videoAiParametricGraphNodeSchema,
    },
    line: {
      description:
        'Renders a straight stroke between two points. Use absolute `x1`/`y1`/`x2`/`y2` for geometric lines like axes, underlines, and ground. Use `from`/`to` endpoint refs to connect other nodes after layout. Add `head: "start" | "end" | "both"` plus `headSize` when you need arrowheads. Animate `drawProgress` to grow the line from start to end.',
      propSchema: videoLineNodeSchema,
    },
    rect: {
      description:
        "Rectangle shape with optional fill, stroke, and corner radius.",
      propSchema: videoRectNodeSchema,
    },
    repeat: {
      description:
        "Macro that repeats one leaf template in a 2D lattice. Use `rows`, `cols`, `rowStep`, and `colStep`. Omitted axes default to 0, so `{ y: 48 }` is valid. Best for grids, diagonal patterns, repeated lines, and repeated geometry like circles. `template` should be a single `rect`, `text`, `icon`, `circle`, or `line`. Do not reference a `repeat` node from layout `children`; place it directly with `origin`.",
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

export const PROMPT_TO_VIDEO_SYSTEM_PROMPT = `${videoCatalog.toPrompt(
  DEFAULT_VIDEO_DIMENSIONS
)}

## Graph Recipe

For a physics lecture sine wave:
- Use a \`functionGraph\` node with \`fn: "sin(x)"\`, centered in the frame with \`showAxes: true\`.
- Start the node with \`drawProgress: 0\`, then add a timeline event with \`action: "draw"\` so the curve traces from left to right.
- Pair the graph with a short text label or equation instead of replacing the graph with icons.

## Line Example

For a connector that should follow layout automatically, use one \`line\` node with endpoint refs instead of hardcoded coordinates:

\`\`\`json
{
  "title": {
    "type": "text",
    "text": "Input",
    "size": 36
  },
  "box": {
    "type": "rect",
    "width": 140,
    "height": 72,
    "fill": "#1e293b"
  },
  "connector": {
    "type": "line",
    "from": { "node": "title", "anchor": "bottom-center" },
    "to": { "node": "box", "anchor": "top-center" },
    "stroke": "#f8fafc",
    "strokeWidth": 4,
    "head": "end",
    "headSize": 10
  }
}
\`\`\`

Use absolute \`x1\`/\`y1\`/\`x2\`/\`y2\` only for true geometric lines like axes, ground, or underlines.`.trim();

export const buildPromptToVideoUserPrompt = (prompt: string): string =>
  `
Create a polished but simple motion graphic from this request:
"${prompt}"

Pad the timeline: add roughly 1 second of delay before the first animation starts and 1 second of hold after the last animation ends. Space out transitions so they don't all fire immediately one after another - give each beat room to breathe.
Prefer semantic layout nodes over manual positioning: use \`center\`, \`align\`, and \`stack\`.
Keep root nodes simple and compose layouts by referencing child IDs in layout nodes.
Use \`dx\`/\`dy\` in the timeline for relative motion - avoid absolute coordinate math.
When using \`repeat\`, place it with \`origin\` / \`rowStep\` / \`colStep\` instead of wrapping it in \`center\`, \`align\`, or \`stack\`.
Use \`line\` for every straight connector or arrow. Prefer \`from\` / \`to\` endpoint refs for node-to-node connections, and reserve \`x1\` / \`y1\` / \`x2\` / \`y2\` for true geometric lines.
Keep all elements fully inside the canvas.
If the request implies unsupported media, reinterpret it as a stylized text-and-shape scene.
`.trim();
