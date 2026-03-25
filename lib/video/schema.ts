import { z } from "zod";

import { collectVideoValidationIssues } from "@/lib/video/validation";

const idSchema = z.string().trim().min(1);
const frameSchema = z.number().int().nonnegative();
const finiteNumberSchema = z.number().finite();
const positiveNumberSchema = z.number().positive();
const nonNegativeNumberSchema = z.number().nonnegative();
const hexColorPattern = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const secondsPattern = /^\d+(?:\.\d+)?s$/;

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
  "ease-out",
  "ease-in",
  "ease-in-out",
  "linear",
  "ease-in-expo",
  "ease-out-expo",
  "ease-in-back",
  "ease-out-back",
  "spring",
]);

export const videoPrimitiveSchema = z.enum([
  "FadeIn",
  "FadeOut",
  "SlideIn",
  "ScaleIn",
  "Pop",
  "Wiggle",
]);

export const videoImageFitSchema = z.enum(["contain", "cover", "fill"]);
export const videoTextAlignSchema = z.enum(["center", "left", "right"]);
export const videoHexColorSchema = z
  .string()
  .trim()
  .regex(hexColorPattern, "Colors must use hex notation.");
export const videoTimeSchema = z.union([
  frameSchema,
  z.string().trim().regex(secondsPattern, 'Time strings must end in "s".'),
]);

const createAnimationValueSchema = <TStepSchema extends z.ZodTypeAny>(
  stepSchema: TStepSchema
) => z.union([stepSchema, z.array(stepSchema).min(1)]);

const createAnimationStepSchema = <TValueSchema extends z.ZodType>(
  valueSchema: TValueSchema
) =>
  z
    .object({
      easing: videoEasingSchema.optional(),
      end: videoTimeSchema,
      from: valueSchema,
      start: videoTimeSchema.optional(),
      to: valueSchema,
    })
    .strict();

const numericAnimationStepSchema =
  createAnimationStepSchema(finiteNumberSchema);
const colorAnimationStepSchema = createAnimationStepSchema(videoHexColorSchema);

export const videoNumericAnimationValueSchema = createAnimationValueSchema(
  numericAnimationStepSchema
);
export const videoColorAnimationValueSchema = createAnimationValueSchema(
  colorAnimationStepSchema
);

const videoBaseAnimateSchema = z
  .object({
    opacity: videoNumericAnimationValueSchema.optional(),
    rotate: videoNumericAnimationValueSchema.optional(),
    scale: videoNumericAnimationValueSchema.optional(),
    scaleX: videoNumericAnimationValueSchema.optional(),
    scaleY: videoNumericAnimationValueSchema.optional(),
    skewX: videoNumericAnimationValueSchema.optional(),
    skewY: videoNumericAnimationValueSchema.optional(),
    x: videoNumericAnimationValueSchema.optional(),
    y: videoNumericAnimationValueSchema.optional(),
  })
  .strict();

const videoNodeBaseSchema = z
  .object({
    anchor: videoAnchorSchema.optional(),
    id: idSchema,
    opacity: finiteNumberSchema.optional(),
    primitives: z.array(videoPrimitiveSchema).optional(),
    rotate: finiteNumberSchema.optional(),
    scale: finiteNumberSchema.optional(),
    scaleX: finiteNumberSchema.optional(),
    scaleY: finiteNumberSchema.optional(),
    skewX: finiteNumberSchema.optional(),
    skewY: finiteNumberSchema.optional(),
    x: finiteNumberSchema.optional(),
    y: finiteNumberSchema.optional(),
    zIndex: z.number().int().optional(),
  })
  .strict();

const videoRectAnimateSchema = videoBaseAnimateSchema
  .extend({
    cornerRadius: videoNumericAnimationValueSchema.optional(),
    fill: videoColorAnimationValueSchema.optional(),
    height: videoNumericAnimationValueSchema.optional(),
    stroke: videoColorAnimationValueSchema.optional(),
    strokeWidth: videoNumericAnimationValueSchema.optional(),
    width: videoNumericAnimationValueSchema.optional(),
  })
  .strict();

const videoTextAnimateSchema = videoBaseAnimateSchema
  .extend({
    color: videoColorAnimationValueSchema.optional(),
    size: videoNumericAnimationValueSchema.optional(),
  })
  .strict();

const videoImageAnimateSchema = videoBaseAnimateSchema
  .extend({
    height: videoNumericAnimationValueSchema.optional(),
    width: videoNumericAnimationValueSchema.optional(),
  })
  .strict();

const videoGroupAnimateSchema = videoBaseAnimateSchema;

type VideoNodeBaseSchemaType = z.infer<typeof videoNodeBaseSchema>;
type VideoGroupAnimateSchemaType = z.infer<typeof videoGroupAnimateSchema>;
type VideoRectAnimateSchemaType = z.infer<typeof videoRectAnimateSchema>;
type VideoTextAnimateSchemaType = z.infer<typeof videoTextAnimateSchema>;
type VideoImageAnimateSchemaType = z.infer<typeof videoImageAnimateSchema>;

interface VideoGroupNodeSchemaType extends VideoNodeBaseSchemaType {
  animate?: VideoGroupAnimateSchemaType;
  children: VideoNodeSchemaType[];
  type: "group";
}

interface VideoRectNodeSchemaType extends VideoNodeBaseSchemaType {
  animate?: VideoRectAnimateSchemaType;
  cornerRadius?: number;
  fill?: string;
  height: number;
  stroke?: string;
  strokeWidth?: number;
  type: "rect";
  width: number;
}

interface VideoTextNodeSchemaType extends VideoNodeBaseSchemaType {
  animate?: VideoTextAnimateSchemaType;
  color?: string;
  fontFamily?: string;
  fontWeight?: number | string;
  lineHeight?: number;
  maxWidth?: number;
  size?: number;
  text: string;
  textAlign?: z.infer<typeof videoTextAlignSchema>;
  type: "text";
}

interface VideoImageNodeSchemaType extends VideoNodeBaseSchemaType {
  animate?: VideoImageAnimateSchemaType;
  fit?: z.infer<typeof videoImageFitSchema>;
  height: number;
  src: string;
  type: "image";
  width: number;
}

type VideoNodeSchemaType =
  | VideoGroupNodeSchemaType
  | VideoImageNodeSchemaType
  | VideoRectNodeSchemaType
  | VideoTextNodeSchemaType;

export const videoNodeSchema: z.ZodType<VideoNodeSchemaType> = z.lazy(() =>
  z.discriminatedUnion("type", [
    videoGroupNodeSchema,
    videoRectNodeSchema,
    videoTextNodeSchema,
    videoImageNodeSchema,
  ])
);

const videoGroupNodeSchema = videoNodeBaseSchema.extend({
  animate: videoGroupAnimateSchema.optional(),
  children: z.array(videoNodeSchema).min(1),
  type: z.literal("group"),
});

const videoRectNodeSchema = videoNodeBaseSchema.extend({
  animate: videoRectAnimateSchema.optional(),
  cornerRadius: nonNegativeNumberSchema.optional(),
  fill: videoHexColorSchema.optional(),
  height: positiveNumberSchema,
  stroke: videoHexColorSchema.optional(),
  strokeWidth: nonNegativeNumberSchema.optional(),
  type: z.literal("rect"),
  width: positiveNumberSchema,
});

const videoTextNodeSchema = videoNodeBaseSchema.extend({
  animate: videoTextAnimateSchema.optional(),
  color: videoHexColorSchema.optional(),
  fontFamily: z.string().trim().min(1).optional(),
  fontWeight: z
    .union([finiteNumberSchema, z.string().trim().min(1)])
    .optional(),
  lineHeight: positiveNumberSchema.optional(),
  maxWidth: positiveNumberSchema.optional(),
  size: positiveNumberSchema.optional(),
  text: z.string().trim().min(1),
  textAlign: videoTextAlignSchema.optional(),
  type: z.literal("text"),
});

const videoImageNodeSchema = videoNodeBaseSchema.extend({
  animate: videoImageAnimateSchema.optional(),
  fit: videoImageFitSchema.optional(),
  height: positiveNumberSchema,
  src: z.string().trim().min(1),
  type: z.literal("image"),
  width: positiveNumberSchema,
});

export const videoSceneSchema = z
  .object({
    background: z
      .union([videoHexColorSchema, videoColorAnimationValueSchema])
      .optional(),
    duration: z.number().int().positive(),
    id: idSchema,
    nodes: z.array(videoNodeSchema),
    startFrame: frameSchema,
  })
  .strict();

export const videoDescriptionSchema = z
  .object({
    background: videoHexColorSchema.optional(),
    fps: positiveNumberSchema,
    height: z.number().int().positive(),
    scenes: z.array(videoSceneSchema).min(1),
    width: z.number().int().positive(),
  })
  .strict()
  .superRefine((videoDescription, ctx) => {
    for (const issue of collectVideoValidationIssues(videoDescription)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path: issue.path,
      });
    }
  });
