import { z } from "zod";

import { collectVideoValidationIssues } from "@/lib/video/validation";

const hexColorPattern = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const fin = z.number().finite();
const pos = z.number().positive();
const nn = z.number().nonnegative();

export const videoHexColorSchema = z
  .string()
  .trim()
  .regex(hexColorPattern, "Colors must use hex notation.");

export const videoAnchorSchema = z.enum([
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
]);

export const videoEasingSchema = z.enum([
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "ease-in-expo",
  "ease-out-expo",
  "ease-in-back",
  "ease-out-back",
  "spring",
]);

export const videoIconLineCapSchema = z.enum(["butt", "round", "square"]);
export const videoIconLineJoinSchema = z.enum(["bevel", "miter", "round"]);
export const videoArrowPositionSchema = z.enum([
  "above",
  "below",
  "left",
  "right",
]);
export const videoTextAlignSchema = z.enum(["center", "left", "right"]);
export const videoStackDirectionSchema = z.enum(["horizontal", "vertical"]);
export const videoStackAlignSchema = z.enum(["start", "center", "end"]);

// ---------------------------------------------------------------------------
// Base node — shared layout + transform properties (no id; dict key = id)
// ---------------------------------------------------------------------------

const videoNodeBaseSchema = z.object({
  opacity: fin.optional(),
  rotate: fin.optional(),
  scale: fin.optional(),
  scaleX: fin.optional(),
  scaleY: fin.optional(),
  skewX: fin.optional(),
  skewY: fin.optional(),
  x: fin.optional(),
  y: fin.optional(),
  zIndex: z.number().int().optional(),
});

// ---------------------------------------------------------------------------
// Leaf node types (no wrapper / container nodes)
// ---------------------------------------------------------------------------

export const videoRectNodeSchema = videoNodeBaseSchema
  .extend({
    cornerRadius: nn.optional(),
    fill: videoHexColorSchema.optional(),
    height: pos,
    stroke: videoHexColorSchema.optional(),
    strokeWidth: nn.optional(),
    type: z.literal("rect"),
    width: pos,
  })
  .strict();

export const videoPointSchema = z
  .object({
    x: fin,
    y: fin,
  })
  .strict();

export const videoArrowEndpointRefSchema = z
  .object({
    anchor: videoAnchorSchema.optional(),
    node: z.string().trim().min(1),
  })
  .strict();

export const videoArrowEndpointSchema = z.union([
  videoPointSchema,
  videoArrowEndpointRefSchema,
]);

export const videoArrowNodeSchema = videoNodeBaseSchema
  .extend({
    from: videoArrowEndpointSchema.optional(),
    gap: nn.optional(),
    headSize: pos.optional(),
    length: pos.optional(),
    position: videoArrowPositionSchema.optional(),
    stroke: videoHexColorSchema.optional(),
    strokeWidth: nn.optional(),
    target: z.string().trim().min(1).optional(),
    to: videoArrowEndpointSchema.optional(),
    type: z.literal("arrow"),
  })
  .strict();

export const videoTextNodeSchema = videoNodeBaseSchema
  .extend({
    color: videoHexColorSchema.optional(),
    fontFamily: z.string().trim().min(1).optional(),
    fontWeight: z.union([fin, z.string().trim().min(1)]).optional(),
    lineHeight: pos.optional(),
    maxWidth: pos.optional(),
    size: pos.optional(),
    text: z.string().trim().min(1),
    textAlign: videoTextAlignSchema.optional(),
    type: z.literal("text"),
  })
  .strict();

const videoIconPointSchema = z.tuple([fin, fin]);

export const videoIconPathPrimitiveSchema = z
  .object({
    d: z.string().trim().min(1),
    type: z.literal("path"),
  })
  .strict();

export const videoIconCirclePrimitiveSchema = z
  .object({
    cx: fin,
    cy: fin,
    r: pos,
    type: z.literal("circle"),
  })
  .strict();

export const videoIconLinePrimitiveSchema = z
  .object({
    type: z.literal("line"),
    x1: fin,
    x2: fin,
    y1: fin,
    y2: fin,
  })
  .strict();

export const videoIconPolylinePrimitiveSchema = z
  .object({
    points: z.array(videoIconPointSchema).min(2),
    type: z.literal("polyline"),
  })
  .strict();

export const videoIconPolygonPrimitiveSchema = z
  .object({
    points: z.array(videoIconPointSchema).min(3),
    type: z.literal("polygon"),
  })
  .strict();

export const videoIconRectPrimitiveSchema = z
  .object({
    height: pos,
    rx: nn.optional(),
    ry: nn.optional(),
    type: z.literal("rect"),
    width: pos,
    x: fin.optional(),
    y: fin.optional(),
  })
  .strict();

export const videoIconPrimitiveSchema = z.discriminatedUnion("type", [
  videoIconPathPrimitiveSchema,
  videoIconCirclePrimitiveSchema,
  videoIconLinePrimitiveSchema,
  videoIconPolylinePrimitiveSchema,
  videoIconPolygonPrimitiveSchema,
  videoIconRectPrimitiveSchema,
]);

// Full engine-facing schema: requires resolved SVG elements.
export const videoIconNodeSchema = videoNodeBaseSchema
  .extend({
    absoluteStrokeWidth: z.boolean().optional(),
    elements: z.array(videoIconPrimitiveSchema).min(1),
    fill: videoHexColorSchema.optional(),
    height: pos,
    lineCap: videoIconLineCapSchema.optional(),
    lineJoin: videoIconLineJoinSchema.optional(),
    stroke: videoHexColorSchema.optional(),
    strokeWidth: nn.optional(),
    type: z.literal("icon"),
    viewportHeight: pos.optional(),
    viewportWidth: pos.optional(),
    width: pos,
  })
  .strict();

// AI-output schema: references icons by Lucide name; the server resolves
// names to elements before passing the description to the Rust engine.
export const videoAiIconNodeSchema = videoNodeBaseSchema
  .extend({
    fill: videoHexColorSchema.optional(),
    height: pos,
    lineCap: videoIconLineCapSchema.optional(),
    lineJoin: videoIconLineJoinSchema.optional(),
    name: z.string().trim().min(1),
    stroke: videoHexColorSchema.optional(),
    strokeWidth: nn.optional(),
    type: z.literal("icon"),
    width: pos,
  })
  .strict();

export const videoCenterNodeSchema = videoNodeBaseSchema
  .extend({
    children: z.array(z.string().min(1)).length(1),
    height: pos.optional(),
    type: z.literal("center"),
    width: pos.optional(),
  })
  .strict();

export const videoAlignNodeSchema = videoNodeBaseSchema
  .extend({
    children: z.array(z.string().min(1)).length(1),
    height: pos.optional(),
    padding: nn.optional(),
    position: videoAnchorSchema,
    type: z.literal("align"),
    width: pos.optional(),
  })
  .strict();

export const videoStackNodeSchema = videoNodeBaseSchema
  .extend({
    align: videoStackAlignSchema.optional(),
    children: z.array(z.string().min(1)).min(1),
    direction: videoStackDirectionSchema,
    gap: nn.optional(),
    height: pos.optional(),
    type: z.literal("stack"),
    width: pos.optional(),
  })
  .strict();

const videoRepeatTemplateSchema = z.union([
  videoArrowNodeSchema,
  videoAiIconNodeSchema,
  videoRectNodeSchema,
  videoTextNodeSchema,
]);

export const videoRepeatNodeSchema = z
  .object({
    colStep: videoPointSchema.optional(),
    cols: z.number().int().positive().max(32),
    origin: videoPointSchema.optional(),
    rowStep: videoPointSchema.optional(),
    rows: z.number().int().positive().max(32),
    template: videoRepeatTemplateSchema,
    type: z.literal("repeat"),
  })
  .strict();

// ---------------------------------------------------------------------------
// Node unions
// ---------------------------------------------------------------------------

// Engine node union: all types with fully-resolved payloads.
export const videoNodeSchema = z.discriminatedUnion("type", [
  videoAlignNodeSchema,
  videoArrowNodeSchema,
  videoCenterNodeSchema,
  videoIconNodeSchema,
  videoRectNodeSchema,
  videoStackNodeSchema,
  videoTextNodeSchema,
]);

// AI output node union: identical to the engine union except icon nodes carry
// a Lucide name instead of raw elements. The server resolves names before
// serialising to Rust.
export const videoAiNodeSchema = z.discriminatedUnion("type", [
  videoAlignNodeSchema,
  videoArrowNodeSchema,
  videoCenterNodeSchema,
  videoAiIconNodeSchema,
  videoRectNodeSchema,
  videoRepeatNodeSchema,
  videoStackNodeSchema,
  videoTextNodeSchema,
]);

// ---------------------------------------------------------------------------
// Timeline event — centralized animation per scene
// ---------------------------------------------------------------------------

export const videoTimelineEventSchema = z
  .object({
    action: z.enum(["draw"]).optional(),
    at: nn,
    color: videoHexColorSchema.optional(),
    cornerRadius: nn.optional(),
    drawProgress: z.number().min(0).max(1).optional(),
    dur: pos.optional(),
    dx: fin.optional(),
    dy: fin.optional(),
    ease: videoEasingSchema.optional(),
    fill: videoHexColorSchema.optional(),
    height: pos.optional(),
    opacity: fin.optional(),
    rotate: fin.optional(),
    scale: fin.optional(),
    scaleX: fin.optional(),
    scaleY: fin.optional(),
    size: pos.optional(),
    skewX: fin.optional(),
    skewY: fin.optional(),
    stroke: videoHexColorSchema.optional(),
    strokeWidth: nn.optional(),
    target: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    width: pos.optional(),
    x: fin.optional(),
    y: fin.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

export const videoAiSceneSchema = z
  .object({
    background: videoHexColorSchema.optional(),
    duration: pos,
    id: z.string().trim().min(1),
    nodes: z.record(z.string(), videoAiNodeSchema),
    timeline: z.array(videoTimelineEventSchema).optional(),
  })
  .strict();

export const videoSceneSchema = z
  .object({
    background: videoHexColorSchema.optional(),
    duration: z.number().int().positive(),
    id: z.string().trim().min(1),
    nodes: z.record(z.string(), videoNodeSchema),
    startFrame: z.number().int().nonnegative(),
    timeline: z.array(videoTimelineEventSchema).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Top-level descriptors
// ---------------------------------------------------------------------------

export const videoDescriptionSchema = z
  .object({
    background: videoHexColorSchema.optional(),
    fps: pos,
    height: z.number().int().positive(),
    scenes: z.array(videoSceneSchema).min(1),
    width: z.number().int().positive(),
  })
  .strict()
  .superRefine((desc, ctx) => {
    for (const issue of collectVideoValidationIssues(desc)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path: issue.path,
      });
    }
  });

export const videoAiOutputSchema = z
  .object({
    background: videoHexColorSchema.optional(),
    scenes: z.array(videoAiSceneSchema).min(1),
  })
  .strict();
