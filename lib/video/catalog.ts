import { z } from "zod";

import { videoAiOutputSchema } from "@/lib/video/schema";

export interface NodeEntry {
  description: string;
  propSchema: z.ZodObject<z.ZodRawShape>;
  slots: string[];
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
  primitives: z.ZodEnum<Record<string, string>>;
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

// These are universal to all nodes and documented in the shared sections below.
const SKIPPED_PROPS = new Set([
  "anchor",
  "children",
  "exit",
  "exitTransition",
  "id",
  "initial",
  "opacity",
  "primitives",
  "rotate",
  "scale",
  "scaleX",
  "scaleY",
  "skewX",
  "skewY",
  "transition",
  "type",
  "x",
  "y",
  "zIndex",
]);

const generateNodeSection = (name: string, entry: NodeEntry): string => {
  const lines: string[] = [`### ${name}`, entry.description, ""];

  if (entry.slots.length > 0) {
    lines.push(`Accepts children: ${entry.slots.join(", ")}`);
    lines.push("");
  }

  const shape = entry.propSchema.shape as Record<string, z.ZodTypeAny>;
  const required: string[] = [];
  const optional: string[] = [];

  for (const [key, fieldSchema] of Object.entries(shape)) {
    if (SKIPPED_PROPS.has(key)) {
      continue;
    }

    const typeDesc = describeZodType(fieldSchema);
    const line = `- \`${key}\`: ${typeDesc}`;

    if (isOptionalField(fieldSchema)) {
      optional.push(line);
    } else {
      required.push(line);
    }
  }

  if (required.length > 0) {
    lines.push("Required:");
    lines.push(...required);
    lines.push("");
  }

  if (optional.length > 0) {
    lines.push("Optional:");
    lines.push(...optional);
    lines.push("");
  }

  return lines.join("\n");
};

const LAYOUT_GUIDANCE = `
## Layout Guidance

Use layout primitives instead of computing pixel coordinates manually:

- \`center\`: place an element at the center of the frame — wraps a single child
- \`stack\`: arrange a list of elements vertically or horizontally with consistent spacing — use \`gap\` for spacing
- \`align\`: position an element relative to a named edge or corner (e.g. title at top-center, watermark at bottom-right)

Use raw \`x\`/\`y\` coordinates only when precise pixel placement is explicitly needed.
Do NOT compute center coordinates as \`width/2\`, \`height/2\` — use \`center\` instead.
`.trim();

const ANIMATION_GUIDANCE = `
## Animations

### Primitives (preferred)

Use \`primitives\` for common effects — single words, never fails:
`.trim();

const generateAnimationSection = (definition: CatalogDefinition): string => {
  const primitiveList = (definition.primitives.options as string[])
    .map((v) => `"${v}"`)
    .join(", ");

  return `${ANIMATION_GUIDANCE}
${primitiveList}

Use \`"BlurFadeIn"\` as the default enter animation. Use \`"FadeOut"\` for exit at scene end.
Use \`"DrawIn"\` on \`functionGraph\` or \`parametricGraph\` nodes to animate drawing from left to right.

### Custom enter animation

Use \`initial\` + \`transition\` for custom entry. \`initial\` is the node's starting state;
the node's own props are the resting target. The engine computes all frames.

\`\`\`json
"initial": { "opacity": 0, "y": 30, "blur": 8 },
"transition": { "duration": "0.4s", "delay": "0.2s", "easing": "ease-out" }
\`\`\`

### Custom exit animation

Use \`exit\` + \`exitTransition\`. The exit window is anchored to the end of the scene.

\`\`\`json
"exit": { "opacity": 0, "y": -20 },
"exitTransition": { "duration": "0.3s", "easing": "ease-in" }
\`\`\`

Animatable in initial/exit: \`opacity\`, \`x\`, \`y\`, \`rotate\`, \`scale\`, \`scaleX\`, \`scaleY\`, \`skewX\`, \`skewY\`, \`blur\`

Transition fields: \`duration\` (required, e.g. \`"0.3s"\`), \`delay\` (optional), \`easing\` (optional)
Easing values: ${(definition.easings.options as string[]).map((v) => `"${v}"`).join(", ")}

### Staggered multi-element entrance

Increment \`transition.delay\` per element — no frame math needed:
\`\`\`json
{ "transition": { "delay": "0s",    "duration": "0.3s" } },
{ "transition": { "delay": "0.15s", "duration": "0.3s" } },
{ "transition": { "delay": "0.3s",  "duration": "0.3s" } }
\`\`\`

### Sequential content

Use **multiple scenes** for elements that appear one after another.
Each scene gets its own nodes with \`"BlurFadeIn"\` / \`"FadeOut"\` primitives.
Never try to coordinate sequential elements within a single scene using delayed animations.`;
};

const generatePrompt = (
  definition: CatalogDefinition,
  options: CatalogOptions
): string => {
  const { fps, height, width } = options;

  const sections: string[] = [
    "You generate video scene descriptions for a deterministic canvas renderer.",
    "",
    `Canvas: ${width}×${height} @ ${fps}fps`,
    "Use one or two scenes. Keep each scene between 48 and 120 frames. Start the first scene at frame 0.",
    "",
    "## Output Rules",
    "",
    "- Return only data that matches the provided schema.",
    "- Use unique IDs for every scene and node.",
    "- Use hex colors (#rrggbb or #rgb) for all color values.",
    "- Never include commentary, markdown, or extra keys outside the schema.",
    "- Never specify raw frame numbers in animations — use seconds via `transition` and `exitTransition`.",
    "- Do not use image nodes.",
    "- Omit `background`, `color`, and `fontFamily` unless intentionally overriding defaults.",
    "  Defaults: background = black, text color = #f8fafc, fontFamily = Inter.",
    "- Use `BlurFadeIn` as the default enter animation unless the user requests something else.",
    "- Keep text concise. Headlines should be one short sentence or less.",
    "- Only include elements the user explicitly requests.",
    "",
    "## Available Node Types",
    "",
  ];

  for (const [name, entry] of Object.entries(definition.nodes)) {
    sections.push(generateNodeSection(name, entry));
  }

  sections.push("## Shared Properties (all nodes)");
  sections.push("");
  sections.push(
    "All nodes support: `id` (string, required), `x` (number), `y` (number), `anchor` (default: center), `opacity`, `rotate`, `scale`, `scaleX`, `scaleY`, `skewX`, `skewY`, `zIndex`, `primitives`, `initial`, `transition`, `exit`, `exitTransition`"
  );
  sections.push("");
  sections.push(
    `Anchor values: ${(definition.anchors.options as string[]).map((v) => `"${v}"`).join(", ")}`
  );
  sections.push("");
  sections.push(generateAnimationSection(definition));
  sections.push("");
  sections.push(LAYOUT_GUIDANCE);

  return sections.join("\n");
};

export const defineCatalog = (definition: CatalogDefinition): Catalog => ({
  getSchema: () => videoAiOutputSchema,
  toPrompt: (options) => generatePrompt(definition, options),
});
