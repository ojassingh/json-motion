import { z } from "zod";

import type {
  NumericAnimationProperty,
  VideoDescription,
  VideoGroupNode,
  VideoKeyframeAnimation,
  VideoNode,
  VideoScene,
} from "@/lib/types/video";
import { collectVideoValidationIssues } from "@/lib/video/validation";

const numericAnimationPropertyValues = [
  "anchorX",
  "anchorY",
  "opacity",
  "rotation",
  "scaleX",
  "scaleY",
  "skewX",
  "skewY",
  "x",
  "y",
] as const satisfies readonly NumericAnimationProperty[];

const textAlignValues = ["center", "left", "right"] as const;
const imageFitValues = ["contain", "cover", "fill"] as const;
const easingValues = ["ease-in", "ease-in-out", "ease-out", "linear"] as const;
const idSchema = z.string().trim().min(1);
const frameSchema = z.number().int().nonnegative();

export const videoNodeTransformSchema = z
  .object({
    anchorX: z.number().finite(),
    anchorY: z.number().finite(),
    opacity: z.number().finite(),
    rotation: z.number().finite(),
    scaleX: z.number().finite(),
    scaleY: z.number().finite(),
    skewX: z.number().finite(),
    skewY: z.number().finite(),
    x: z.number().finite(),
    y: z.number().finite(),
    zIndex: z.number().int(),
  })
  .partial();

const keyframePointSchema = z.object({
  frame: frameSchema,
  value: z.number().finite(),
});

const videoKeyframeAnimationSchema: z.ZodType<VideoKeyframeAnimation> =
  z.object({
    easing: z.enum(easingValues).optional(),
    endFrame: frameSchema,
    keyframes: z
      .tuple([keyframePointSchema, keyframePointSchema])
      .rest(keyframePointSchema),
    property: z.enum(numericAnimationPropertyValues),
    startFrame: frameSchema,
    type: z.literal("keyframes"),
  });

const videoFadeInEffectSchema = z.object({
  easing: z.enum(easingValues).optional(),
  endFrame: frameSchema,
  fromOpacity: z.number().finite().optional(),
  name: z.literal("fade-in"),
  startFrame: frameSchema,
  type: z.literal("effect"),
});

const videoScaleInEffectSchema = z.object({
  easing: z.enum(easingValues).optional(),
  endFrame: frameSchema,
  fromScale: z.number().finite().optional(),
  name: z.literal("scale-in"),
  startFrame: frameSchema,
  type: z.literal("effect"),
});

const videoSlideInEffectSchema = z.object({
  easing: z.enum(easingValues).optional(),
  endFrame: frameSchema,
  fromX: z.number().finite().optional(),
  fromY: z.number().finite().optional(),
  name: z.literal("slide-in"),
  startFrame: frameSchema,
  type: z.literal("effect"),
});

const videoEffectSchema = z.discriminatedUnion("name", [
  videoFadeInEffectSchema,
  videoScaleInEffectSchema,
  videoSlideInEffectSchema,
]);

export const videoNodeAnimationSchema = z.union([
  videoKeyframeAnimationSchema,
  videoEffectSchema,
]);

const videoNodeBaseSchema = z.object({
  animations: z.array(videoNodeAnimationSchema).optional(),
  id: idSchema,
  transform: videoNodeTransformSchema.optional(),
});

const videoNodeSchema: z.ZodType<VideoNode> = z.lazy(
  (): z.ZodType<VideoNode> =>
    z.union([
      videoGroupNodeSchema,
      videoRectNodeSchema,
      videoTextNodeSchema,
      videoImageNodeSchema,
    ])
);

const videoGroupNodeSchema: z.ZodType<VideoGroupNode> = z.lazy(
  (): z.ZodType<VideoGroupNode> =>
    videoNodeBaseSchema.extend({
      children: z.array(videoNodeSchema).min(1),
      type: z.literal("group"),
    })
);

const videoRectNodeSchema = videoNodeBaseSchema.extend({
  fill: z.string().trim().min(1).optional(),
  height: z.number().positive(),
  radius: z.number().nonnegative().optional(),
  stroke: z.string().trim().min(1).optional(),
  strokeWidth: z.number().nonnegative().optional(),
  type: z.literal("rect"),
  width: z.number().positive(),
});

const videoTextNodeSchema = videoNodeBaseSchema.extend({
  color: z.string().trim().min(1).optional(),
  fontFamily: z.string().trim().min(1).optional(),
  fontSize: z.number().positive().optional(),
  fontWeight: z
    .union([z.number().finite(), z.string().trim().min(1)])
    .optional(),
  lineHeight: z.number().positive().optional(),
  maxWidth: z.number().positive().optional(),
  text: z.string().min(1),
  textAlign: z.enum(textAlignValues).optional(),
  type: z.literal("text"),
});

const videoImageNodeSchema = videoNodeBaseSchema.extend({
  fit: z.enum(imageFitValues).optional(),
  height: z.number().positive(),
  src: z.string().trim().min(1),
  type: z.literal("image"),
  width: z.number().positive(),
});

const videoSceneSchema: z.ZodType<VideoScene> = z.object({
  background: z.string().trim().min(1).optional(),
  durationInFrames: z.number().int().positive(),
  id: idSchema,
  nodes: z.array(videoNodeSchema),
  startFrame: frameSchema,
});

export const videoDescriptionSchema: z.ZodType<VideoDescription> = z
  .object({
    background: z.string().trim().min(1).optional(),
    fps: z.number().positive(),
    height: z.number().int().positive(),
    scenes: z.tuple([videoSceneSchema]).rest(videoSceneSchema),
    width: z.number().int().positive(),
  })
  .superRefine((videoDescription, ctx) => {
    for (const issue of collectVideoValidationIssues(videoDescription)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path: issue.path,
      });
    }
  });
