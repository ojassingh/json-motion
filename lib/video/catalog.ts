import { z } from "zod";

import { videoAiOutputSchema } from "@/lib/video/schema";

export interface NodeEntry {
  description: string;
  propSchema: z.ZodObject<z.ZodRawShape>;
}

export interface CatalogOptions {
  fps: number;
  height: number;
  width: number;
}

interface CatalogDefinition {
  anchors: z.ZodEnum<Record<string, string>>;
  easings: z.ZodEnum<Record<string, string>>;
  nodes: Record<string, NodeEntry>;
}

export interface Catalog {
  getSchema: () => typeof videoAiOutputSchema;
  toPrompt: (options: CatalogOptions) => string;
}

const describeZodType = (schema: z.ZodTypeAny): string => {
  if (schema instanceof z.ZodOptional) {
    return describeZodType(schema.unwrap() as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodNullable) {
    return `${describeZodType(schema.unwrap() as z.ZodTypeAny)} | null`;
  }
  if (schema instanceof z.ZodLiteral) {
    return typeof schema.value === "string"
      ? `"${schema.value}"`
      : String(schema.value);
  }
  if (schema instanceof z.ZodEnum) {
    return (schema.options as string[]).map((v) => `"${v}"`).join(" | ");
  }
  if (schema instanceof z.ZodString) {
    return "string";
  }
  if (schema instanceof z.ZodNumber) {
    return "number";
  }
  if (schema instanceof z.ZodBoolean) {
    return "boolean";
  }
  if (schema instanceof z.ZodArray) {
    return `${describeZodType(schema.element as z.ZodTypeAny)}[]`;
  }
  if (schema instanceof z.ZodUnion) {
    return (schema.options as z.ZodTypeAny[]).map(describeZodType).join(" | ");
  }
  if (schema instanceof z.ZodObject) {
    return "object";
  }
  return "unknown";
};

const isOptionalField = (schema: z.ZodTypeAny): boolean =>
  schema instanceof z.ZodOptional;

const SKIPPED_PROPS = new Set([
  "anchorAlign",
  "anchorEdge",
  "anchorTo",
  "gap",
  "opacity",
  "place",
  "rotate",
  "scale",
  "scaleX",
  "scaleY",
  "skewX",
  "skewY",
  "type",
  "x",
  "y",
  "zIndex",
]);

const generateNodeSection = (name: string, entry: NodeEntry): string => {
  const lines: string[] = [`### ${name}`, entry.description, ""];
  const shape = entry.propSchema.shape as Record<string, z.ZodTypeAny>;
  const required: string[] = [];
  const optional: string[] = [];

  for (const [key, fieldSchema] of Object.entries(shape)) {
    if (SKIPPED_PROPS.has(key)) {
      continue;
    }
    const line = `- \`${key}\`: ${describeZodType(fieldSchema)}`;
    if (isOptionalField(fieldSchema)) {
      optional.push(line);
    } else {
      required.push(line);
    }
  }

  if (required.length > 0) {
    lines.push("Required:", ...required, "");
  }
  if (optional.length > 0) {
    lines.push("Optional:", ...optional, "");
  }

  return lines.join("\n");
};

const generatePrompt = (
  definition: CatalogDefinition,
  options: CatalogOptions
): string => {
  const { fps, height, width } = options;
  const easings = (definition.easings.options as string[])
    .map((v) => `"${v}"`)
    .join(", ");
  const anchors = (definition.anchors.options as string[])
    .map((v) => `"${v}"`)
    .join(", ");

  const sections: string[] = [
    "You generate video scene descriptions for a deterministic canvas renderer.",
    "",
    `Canvas: ${width}×${height} @ ${fps}fps`,
    "Use one or two scenes. Keep each scene between 1s and 4s. Express duration as a number in seconds (e.g. 2, 1.5).",
    "",
    "## Output Rules",
    "",
    "- Return only data that matches the provided schema.",
    "- Nodes are a dictionary keyed by unique ID (no `id` field on the node).",
    "- Use hex colors (#rrggbb or #rgb) for all color values.",
    "- Never include commentary, markdown, or extra keys outside the schema.",
    "- Do not use image nodes.",
    "- Omit `background`, `color`, and `fontFamily` unless intentionally overriding defaults.",
    "  Defaults: background = black, text color = #f8fafc, fontFamily = Inter.",
    "- Keep text concise. Headlines should be one short sentence or less.",
    "- Only include elements the user explicitly requests.",
    "",
    "## Available Node Types",
    "",
  ];

  for (const [name, entry] of Object.entries(definition.nodes)) {
    sections.push(generateNodeSection(name, entry));
  }

  sections.push(
    "## Shared Node Properties",
    "",
    "All nodes support: `place`, `anchorTo`, `anchorEdge`, `anchorAlign`, `gap`, `x`, `y`, `opacity`, `rotate`, `scale`, `scaleX`, `scaleY`, `skewX`, `skewY`, `zIndex`",
    "",
    "## Layout",
    "",
    "Use `place` for absolute canvas positioning. It accepts an anchor value: " +
      anchors,
    '`place: "center"` centers the node on the canvas. `place: "top-right"` puts it in the top-right corner.',
    "",
    "Use `anchorTo` to position a node relative to another node:",
    "- `anchorTo`: ID of the parent node",
    "- `anchorEdge`: which edge of the parent to attach to (`top`, `bottom`, `left`, `right`). Default: `bottom`.",
    "- `anchorAlign`: cross-axis alignment (`start`, `center`, `end`). Default: `center`.",
    "- `gap`: spacing from the edge in pixels.",
    "",
    "Nodes without `place` or `anchorTo` use explicit `x`/`y` (top-left corner).",
    "",
    "### Example: title with subtitle below",
    "",
    "```json",
    '"nodes": {',
    '  "title": { "type": "text", "text": "Hello", "size": 64, "place": "center" },',
    '  "subtitle": { "type": "text", "text": "World", "size": 32, "anchorTo": "title", "anchorEdge": "bottom", "gap": 16 }',
    "}",
    "```",
    "",
    "## Timeline (Animation)",
    "",
    "All animation is in a centralized `timeline` array on each scene. Nodes have no keyframes or primitives.",
    "",
    "Each timeline event has:",
    "- `at`: when the event starts (seconds)",
    "- `target`: node ID or array of IDs",
    "- `dur`: animation duration in seconds (omit for instant snap)",
    `- \`ease\`: easing function. Values: ${easings}`,
    '- `action`: optional macro — `"draw"` animates `drawProgress` from 0 to 1 for graph nodes',
    "",
    "Animatable properties: `opacity`, `dx`, `dy`, `x`, `y`, `scale`, `scaleX`, `scaleY`, `rotate`, `skewX`, `skewY`, `fill`, `stroke`, `color`, `width`, `height`, `size`, `cornerRadius`, `strokeWidth`, `drawProgress`",
    "",
    "`dx`/`dy` are offsets from the layout-resolved position. Use them for relative motion instead of computing absolute coordinates.",
    "`x`/`y` in the timeline override the layout position with an absolute canvas position.",
    "",
    "### Example: fade in, move up, then draw a graph",
    "",
    "```json",
    '"timeline": [',
    '  { "at": 0.5, "target": ["title", "subtitle"], "opacity": 1, "dur": 0.5, "ease": "ease-out" },',
    '  { "at": 1.5, "target": ["title", "subtitle"], "dy": -20, "dur": 0.5 },',
    '  { "at": 1.8, "action": "draw", "target": "graph", "dur": 1.5, "ease": "linear" },',
    '  { "at": 3.5, "target": ["title", "subtitle", "graph"], "opacity": 0, "dur": 0.3 }',
    "]",
    "```",
    "",
    "Pad the timeline: add ~1 second before the first animation and ~1 second hold after the last."
  );

  return sections.join("\n");
};

export const defineCatalog = (definition: CatalogDefinition): Catalog => ({
  getSchema: () => videoAiOutputSchema,
  toPrompt: (options) => generatePrompt(definition, options),
});
