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
  "BlurFadeIn",
  "DrawIn",
  "FadeIn",
  "FadeOut",
  "Pop",
  "ScaleIn",
  "SlideIn",
  "Wiggle",
]);

export const videoImageFitSchema = z.enum(["contain", "cover", "fill"]);
export const videoTextAlignSchema = z.enum(["center", "left", "right"]);
export const videoStackAlignSchema = z.enum(["start", "center", "end"]);
export const videoHexColorSchema = z
  .string()
  .trim()
  .regex(hexColorPattern, "Colors must use hex notation.");

/**
 * Timing for enter or exit animations. All durations are in seconds (e.g. "0.3s").
 * The engine converts to frames — never specify raw frame numbers.
 */
export const videoNodeTransitionSchema = z
  .object({
    delay: z
      .string()
      .trim()
      .regex(secondsPattern, 'Delay must be a seconds string, e.g. "0.2s".')
      .optional(),
    duration: z
      .string()
      .trim()
      .regex(secondsPattern, 'Duration must be a seconds string, e.g. "0.3s".'),
    easing: videoEasingSchema.optional(),
  })
  .strict();

/**
 * The starting state (initial) or ending state (exit) of a node's animation.
 * All properties are optional deltas from the node's resting values.
 */
export const videoNodeStateSchema = z
  .object({
    blur: nonNegativeNumberSchema.optional(),
    opacity: finiteNumberSchema.optional(),
    rotate: finiteNumberSchema.optional(),
    scale: finiteNumberSchema.optional(),
    scaleX: finiteNumberSchema.optional(),
    scaleY: finiteNumberSchema.optional(),
    skewX: finiteNumberSchema.optional(),
    skewY: finiteNumberSchema.optional(),
    x: finiteNumberSchema.optional(),
    y: finiteNumberSchema.optional(),
  })
  .strict();

const videoNodeBaseSchema = z
  .object({
    anchor: videoAnchorSchema.optional(),
    exit: videoNodeStateSchema.optional(),
    exitTransition: videoNodeTransitionSchema.optional(),
    id: idSchema,
    initial: videoNodeStateSchema.optional(),
    opacity: finiteNumberSchema.optional(),
    primitives: z.array(videoPrimitiveSchema).optional(),
    rotate: finiteNumberSchema.optional(),
    scale: finiteNumberSchema.optional(),
    scaleX: finiteNumberSchema.optional(),
    scaleY: finiteNumberSchema.optional(),
    skewX: finiteNumberSchema.optional(),
    skewY: finiteNumberSchema.optional(),
    transition: videoNodeTransitionSchema.optional(),
    x: finiteNumberSchema.optional(),
    y: finiteNumberSchema.optional(),
    zIndex: z.number().int().optional(),
  })
  .strict();

type VideoNodeBaseSchemaType = z.infer<typeof videoNodeBaseSchema>;

export const videoAiNodeBaseSchema = z
  .object({
    anchor: videoAnchorSchema.optional(),
    exit: videoNodeStateSchema.optional(),
    exitTransition: videoNodeTransitionSchema.optional(),
    id: idSchema,
    initial: videoNodeStateSchema.optional(),
    opacity: finiteNumberSchema.optional(),
    primitives: z.array(videoPrimitiveSchema).optional(),
    rotate: finiteNumberSchema.optional(),
    scale: finiteNumberSchema.optional(),
    scaleX: finiteNumberSchema.optional(),
    scaleY: finiteNumberSchema.optional(),
    skewX: finiteNumberSchema.optional(),
    skewY: finiteNumberSchema.optional(),
    transition: videoNodeTransitionSchema.optional(),
    x: finiteNumberSchema.optional(),
    y: finiteNumberSchema.optional(),
    zIndex: z.number().int().optional(),
  })
  .strict();

type VideoAiNodeBaseSchemaType = z.infer<typeof videoAiNodeBaseSchema>;

interface VideoGroupNodeSchemaType extends VideoNodeBaseSchemaType {
  children: VideoNodeSchemaType[];
  type: "group";
}

interface VideoRectNodeSchemaType extends VideoNodeBaseSchemaType {
  cornerRadius?: number;
  fill?: string;
  height: number;
  stroke?: string;
  strokeWidth?: number;
  type: "rect";
  width: number;
}

interface VideoTextNodeSchemaType extends VideoNodeBaseSchemaType {
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
  fit?: z.infer<typeof videoImageFitSchema>;
  height: number;
  src: string;
  type: "image";
  width: number;
}

export interface VideoMathNodeSchemaType extends VideoNodeBaseSchemaType {
  color?: string;
  fontSize: number;
  height?: number;
  latex: string;
  type: "math";
  width?: number;
}

interface VideoAiGroupNodeSchemaType extends VideoAiNodeBaseSchemaType {
  children: VideoAiNodeSchemaType[];
  type: "group";
}

interface VideoAiRectNodeSchemaType extends VideoAiNodeBaseSchemaType {
  cornerRadius?: number;
  fill?: string;
  height: number;
  stroke?: string;
  strokeWidth?: number;
  type: "rect";
  width: number;
}

interface VideoAiTextNodeSchemaType extends VideoAiNodeBaseSchemaType {
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

interface VideoAiMathNodeSchemaType extends VideoAiNodeBaseSchemaType {
  color?: string;
  fontSize: number;
  latex: string;
  type: "math";
}

interface VideoAiFunctionGraphNodeSchemaType extends VideoAiNodeBaseSchemaType {
  color?: string;
  drawProgress?: number;
  fn: string;
  height: number;
  showAxes?: boolean;
  showGrid?: boolean;
  strokeWidth?: number;
  type: "functionGraph";
  width: number;
  xRange: number[];
  yRange: number[];
}

interface VideoAiParametricGraphNodeSchemaType
  extends VideoAiNodeBaseSchemaType {
  color?: string;
  drawProgress?: number;
  fnX: string;
  fnY: string;
  height: number;
  samples?: number;
  strokeWidth?: number;
  tRange: number[];
  type: "parametricGraph";
  width: number;
}

interface VideoAiCenterNodeSchemaType extends VideoAiNodeBaseSchemaType {
  children: VideoAiNodeSchemaType[];
  height?: number;
  type: "center";
  width?: number;
}

interface VideoAiStackNodeSchemaType extends VideoAiNodeBaseSchemaType {
  align?: z.infer<typeof videoStackAlignSchema>;
  children: VideoAiNodeSchemaType[];
  direction: "vertical" | "horizontal";
  gap: number;
  type: "stack";
}

interface VideoAiAlignNodeSchemaType extends VideoAiNodeBaseSchemaType {
  children: VideoAiNodeSchemaType[];
  padding?: number;
  position: z.infer<typeof videoAnchorSchema>;
  type: "align";
}

export interface VideoFunctionGraphNodeSchemaType
  extends VideoNodeBaseSchemaType {
  color?: string;
  drawProgress?: number;
  fn: string;
  height: number;
  showAxes?: boolean;
  showGrid?: boolean;
  strokeWidth?: number;
  type: "functionGraph";
  width: number;
  xRange: number[];
  yRange: number[];
}

export interface VideoParametricGraphNodeSchemaType
  extends VideoNodeBaseSchemaType {
  color?: string;
  drawProgress?: number;
  fnX: string;
  fnY: string;
  height: number;
  samples?: number;
  strokeWidth?: number;
  tRange: number[];
  type: "parametricGraph";
  width: number;
}

interface VideoCenterNodeSchemaType extends VideoNodeBaseSchemaType {
  children: VideoNodeSchemaType[];
  height?: number;
  type: "center";
  width?: number;
}

interface VideoStackNodeSchemaType extends VideoNodeBaseSchemaType {
  align?: z.infer<typeof videoStackAlignSchema>;
  children: VideoNodeSchemaType[];
  direction: "vertical" | "horizontal";
  gap: number;
  type: "stack";
}

interface VideoAlignNodeSchemaType extends VideoNodeBaseSchemaType {
  children: VideoNodeSchemaType[];
  padding?: number;
  position: z.infer<typeof videoAnchorSchema>;
  type: "align";
}

type VideoNodeSchemaType =
  | VideoAlignNodeSchemaType
  | VideoCenterNodeSchemaType
  | VideoFunctionGraphNodeSchemaType
  | VideoGroupNodeSchemaType
  | VideoImageNodeSchemaType
  | VideoMathNodeSchemaType
  | VideoParametricGraphNodeSchemaType
  | VideoRectNodeSchemaType
  | VideoStackNodeSchemaType
  | VideoTextNodeSchemaType;

type VideoAiNodeSchemaType =
  | VideoAiAlignNodeSchemaType
  | VideoAiCenterNodeSchemaType
  | VideoAiFunctionGraphNodeSchemaType
  | VideoAiGroupNodeSchemaType
  | VideoAiMathNodeSchemaType
  | VideoAiParametricGraphNodeSchemaType
  | VideoAiRectNodeSchemaType
  | VideoAiStackNodeSchemaType
  | VideoAiTextNodeSchemaType;

export const videoNodeSchema: z.ZodType<VideoNodeSchemaType> = z.lazy(() =>
  z.discriminatedUnion("type", [
    videoAlignNodeSchema,
    videoCenterNodeSchema,
    videoGroupNodeSchema,
    videoRectNodeSchema,
    videoTextNodeSchema,
    videoImageNodeSchema,
    videoMathNodeSchema,
    videoFunctionGraphNodeSchema,
    videoParametricGraphNodeSchema,
    videoStackNodeSchema,
  ])
);

export const videoAiNodeSchema: z.ZodType<VideoAiNodeSchemaType> = z.lazy(() =>
  z.discriminatedUnion("type", [
    videoAiAlignNodeSchema,
    videoAiCenterNodeSchema,
    videoAiGroupNodeSchema,
    videoAiRectNodeSchema,
    videoAiTextNodeSchema,
    videoAiMathNodeSchema,
    videoAiFunctionGraphNodeSchema,
    videoAiParametricGraphNodeSchema,
    videoAiStackNodeSchema,
  ])
);

export const videoGroupNodeSchema = videoNodeBaseSchema.extend({
  children: z.array(videoNodeSchema).min(1),
  type: z.literal("group"),
});

export const videoAiGroupNodeSchema = videoAiNodeBaseSchema.extend({
  children: z.array(videoAiNodeSchema).min(1),
  type: z.literal("group"),
});

export const videoCenterNodeSchema = videoNodeBaseSchema.extend({
  children: z.array(videoNodeSchema).min(1).max(1),
  height: positiveNumberSchema.optional(),
  type: z.literal("center"),
  width: positiveNumberSchema.optional(),
});

export const videoAiCenterNodeSchema = videoAiNodeBaseSchema.extend({
  children: z.array(videoAiNodeSchema).min(1).max(1),
  height: positiveNumberSchema.optional(),
  type: z.literal("center"),
  width: positiveNumberSchema.optional(),
});

export const videoStackNodeSchema = videoNodeBaseSchema.extend({
  align: videoStackAlignSchema.optional(),
  children: z.array(videoNodeSchema).min(1),
  direction: z.enum(["vertical", "horizontal"]),
  gap: nonNegativeNumberSchema,
  type: z.literal("stack"),
});

export const videoAiStackNodeSchema = videoAiNodeBaseSchema.extend({
  align: videoStackAlignSchema.optional(),
  children: z.array(videoAiNodeSchema).min(1),
  direction: z.enum(["vertical", "horizontal"]),
  gap: nonNegativeNumberSchema,
  type: z.literal("stack"),
});

export const videoAlignNodeSchema = videoNodeBaseSchema.extend({
  children: z.array(videoNodeSchema).min(1).max(1),
  padding: nonNegativeNumberSchema.optional(),
  position: videoAnchorSchema,
  type: z.literal("align"),
});

export const videoAiAlignNodeSchema = videoAiNodeBaseSchema.extend({
  children: z.array(videoAiNodeSchema).min(1).max(1),
  padding: nonNegativeNumberSchema.optional(),
  position: videoAnchorSchema,
  type: z.literal("align"),
});

export const videoRectNodeSchema = videoNodeBaseSchema.extend({
  cornerRadius: nonNegativeNumberSchema.optional(),
  fill: videoHexColorSchema.optional(),
  height: positiveNumberSchema,
  stroke: videoHexColorSchema.optional(),
  strokeWidth: nonNegativeNumberSchema.optional(),
  type: z.literal("rect"),
  width: positiveNumberSchema,
});

export const videoAiRectNodeSchema = videoAiNodeBaseSchema.extend({
  cornerRadius: nonNegativeNumberSchema.optional(),
  fill: videoHexColorSchema.optional(),
  height: positiveNumberSchema,
  stroke: videoHexColorSchema.optional(),
  strokeWidth: nonNegativeNumberSchema.optional(),
  type: z.literal("rect"),
  width: positiveNumberSchema,
});

export const videoTextNodeSchema = videoNodeBaseSchema.extend({
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

export const videoAiTextNodeSchema = videoAiNodeBaseSchema.extend({
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
  fit: videoImageFitSchema.optional(),
  height: positiveNumberSchema,
  src: z.string().trim().min(1),
  type: z.literal("image"),
  width: positiveNumberSchema,
});

export const videoMathNodeSchema = videoNodeBaseSchema.extend({
  color: videoHexColorSchema.optional(),
  fontSize: positiveNumberSchema,
  height: positiveNumberSchema.optional(),
  latex: z.string().trim().min(1),
  type: z.literal("math"),
  width: positiveNumberSchema.optional(),
});

export const videoAiMathNodeSchema = videoAiNodeBaseSchema.extend({
  color: videoHexColorSchema.optional(),
  fontSize: positiveNumberSchema,
  latex: z.string().trim().min(1),
  type: z.literal("math"),
});

const rangeSchema = z.array(finiteNumberSchema).length(2);

export const videoFunctionGraphNodeSchema = videoNodeBaseSchema.extend({
  color: videoHexColorSchema.optional(),
  drawProgress: z.number().min(0).max(1).optional(),
  fn: z.string().trim().min(1),
  height: positiveNumberSchema,
  showAxes: z.boolean().optional(),
  showGrid: z.boolean().optional(),
  strokeWidth: positiveNumberSchema.optional(),
  type: z.literal("functionGraph"),
  width: positiveNumberSchema,
  xRange: rangeSchema,
  yRange: rangeSchema,
});

export const videoAiFunctionGraphNodeSchema = videoAiNodeBaseSchema.extend({
  color: videoHexColorSchema.optional(),
  drawProgress: z.number().min(0).max(1).optional(),
  fn: z.string().trim().min(1),
  height: positiveNumberSchema,
  showAxes: z.boolean().optional(),
  showGrid: z.boolean().optional(),
  strokeWidth: positiveNumberSchema.optional(),
  type: z.literal("functionGraph"),
  width: positiveNumberSchema,
  xRange: rangeSchema,
  yRange: rangeSchema,
});

export const videoParametricGraphNodeSchema = videoNodeBaseSchema.extend({
  color: videoHexColorSchema.optional(),
  drawProgress: z.number().min(0).max(1).optional(),
  fnX: z.string().trim().min(1),
  fnY: z.string().trim().min(1),
  height: positiveNumberSchema,
  samples: z.number().int().positive().optional(),
  strokeWidth: positiveNumberSchema.optional(),
  tRange: rangeSchema,
  type: z.literal("parametricGraph"),
  width: positiveNumberSchema,
});

export const videoAiParametricGraphNodeSchema = videoAiNodeBaseSchema.extend({
  color: videoHexColorSchema.optional(),
  drawProgress: z.number().min(0).max(1).optional(),
  fnX: z.string().trim().min(1),
  fnY: z.string().trim().min(1),
  height: positiveNumberSchema,
  samples: z.number().int().positive().optional(),
  strokeWidth: positiveNumberSchema.optional(),
  tRange: rangeSchema,
  type: z.literal("parametricGraph"),
  width: positiveNumberSchema,
});

export const videoSceneSchema = z
  .object({
    background: videoHexColorSchema.optional(),
    duration: z.number().int().positive(),
    id: idSchema,
    nodes: z.array(videoNodeSchema),
    startFrame: frameSchema,
  })
  .strict();

export const videoAiSceneSchema = z
  .object({
    background: videoHexColorSchema.optional(),
    duration: z
      .string()
      .trim()
      .regex(secondsPattern, 'Duration must be a seconds string, e.g. "2s".'),
    id: idSchema,
    nodes: z.array(videoAiNodeSchema),
  })
  .strict();

const nodeUsesCustomAnimation = (node: VideoAiNodeSchemaType): boolean =>
  node.initial !== undefined ||
  node.transition !== undefined ||
  node.exit !== undefined ||
  node.exitTransition !== undefined;

const visitAiNode = (
  node: VideoAiNodeSchemaType,
  visitor: (node: VideoAiNodeSchemaType) => void
): void => {
  visitor(node);

  if (
    node.type === "group" ||
    node.type === "center" ||
    node.type === "stack" ||
    node.type === "align"
  ) {
    for (const child of node.children) {
      visitAiNode(child, visitor);
    }
  }
};

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

/**
 * Schema for AI-generated output — canvas config (fps, width, height) is
 * intentionally excluded and injected server-side so the model never controls
 * rendering dimensions.
 */
export const videoAiOutputSchema = z
  .object({
    background: videoHexColorSchema.optional(),
    scenes: z.array(videoAiSceneSchema).min(1),
  })
  .strict()
  .superRefine((videoDescription, ctx) => {
    for (const [sceneIndex, scene] of videoDescription.scenes.entries()) {
      for (const [nodeIndex, node] of scene.nodes.entries()) {
        visitAiNode(node, (currentNode) => {
          if (
            currentNode.primitives !== undefined &&
            currentNode.primitives.length > 0 &&
            nodeUsesCustomAnimation(currentNode)
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message:
                "Use either primitives or custom animation fields on a node, never both.",
              path: ["scenes", sceneIndex, "nodes", nodeIndex],
            });
          }
        });
      }
    }
  });
