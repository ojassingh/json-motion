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

export const videoImageFitSchema = z.enum(["contain", "cover", "fill"]);
export const videoTextAlignSchema = z.enum(["center", "left", "right"]);
export const videoAnchorEdgeSchema = z.enum(["top", "bottom", "left", "right"]);
export const videoAnchorAlignSchema = z.enum(["start", "center", "end"]);

// ---------------------------------------------------------------------------
// Base node — shared layout + transform properties (no id; dict key = id)
// ---------------------------------------------------------------------------

const videoNodeBaseSchema = z.object({
  anchorAlign: videoAnchorAlignSchema.optional(),
  anchorEdge: videoAnchorEdgeSchema.optional(),
  anchorTo: z.string().min(1).optional(),
  gap: nn.optional(),
  opacity: fin.optional(),
  place: videoAnchorSchema.optional(),
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

const videoImageNodeSchema = videoNodeBaseSchema
  .extend({
    fit: videoImageFitSchema.optional(),
    height: pos,
    src: z.string().trim().min(1),
    type: z.literal("image"),
    width: pos,
  })
  .strict();

export const videoMathNodeSchema = videoNodeBaseSchema
  .extend({
    color: videoHexColorSchema.optional(),
    fontSize: pos,
    height: pos.optional(),
    latex: z.string().trim().min(1),
    type: z.literal("math"),
    width: pos.optional(),
  })
  .strict();

const rangeSchema = z.array(fin).length(2);

export const videoFunctionGraphNodeSchema = videoNodeBaseSchema
  .extend({
    color: videoHexColorSchema.optional(),
    drawProgress: z.number().min(0).max(1).optional(),
    fn: z.string().trim().min(1),
    height: pos,
    showAxes: z.boolean().optional(),
    showGrid: z.boolean().optional(),
    strokeWidth: pos.optional(),
    type: z.literal("functionGraph"),
    width: pos,
    xRange: rangeSchema,
    yRange: rangeSchema,
  })
  .strict();

export const videoParametricGraphNodeSchema = videoNodeBaseSchema
  .extend({
    color: videoHexColorSchema.optional(),
    drawProgress: z.number().min(0).max(1).optional(),
    fnX: z.string().trim().min(1),
    fnY: z.string().trim().min(1),
    height: pos,
    samples: z.number().int().positive().optional(),
    strokeWidth: pos.optional(),
    tRange: rangeSchema,
    type: z.literal("parametricGraph"),
    width: pos,
  })
  .strict();

// ---------------------------------------------------------------------------
// Node union (single set for both AI output and engine)
// ---------------------------------------------------------------------------

export const videoNodeSchema = z.discriminatedUnion("type", [
  videoRectNodeSchema,
  videoTextNodeSchema,
  videoImageNodeSchema,
  videoMathNodeSchema,
  videoFunctionGraphNodeSchema,
  videoParametricGraphNodeSchema,
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
    nodes: z.record(z.string(), videoNodeSchema),
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
