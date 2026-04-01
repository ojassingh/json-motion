import type { z } from "zod";

import type {
  videoAiEquationNodeSchema,
  videoAiIconNodeSchema,
  videoAiNodeSchema,
  videoAiOutputSchema,
  videoAiSceneSchema,
  videoAlignNodeSchema,
  videoAnchorSchema,
  videoArrowEndpointRefSchema,
  videoArrowNodeSchema,
  videoArrowPositionSchema,
  videoCenterNodeSchema,
  videoCircleNodeSchema,
  videoDescriptionSchema,
  videoEasingSchema,
  videoHexColorSchema,
  videoIconLineCapSchema,
  videoIconLineJoinSchema,
  videoIconNodeSchema,
  videoIconPrimitiveSchema,
  videoLineNodeSchema,
  videoNodeSchema,
  videoPointSchema,
  videoRepeatNodeSchema,
  videoSceneSchema,
  videoStackAlignSchema,
  videoStackDirectionSchema,
  videoStackNodeSchema,
  videoTextAlignSchema,
  videoTimelineEventSchema,
  videoVectorSchema,
} from "@/lib/video/schema";

export type VideoAiOutput = z.infer<typeof videoAiOutputSchema>;
export type VideoAiScene = z.infer<typeof videoAiSceneSchema>;
export type VideoAnchor = z.infer<typeof videoAnchorSchema>;
export type VideoColor = z.infer<typeof videoHexColorSchema>;
export type VideoDescription = z.infer<typeof videoDescriptionSchema>;
export type VideoEasingName = z.infer<typeof videoEasingSchema>;
export type VideoAiEquationNode = z.infer<typeof videoAiEquationNodeSchema>;
export type VideoAiIconNode = z.infer<typeof videoAiIconNodeSchema>;
export type VideoAiNode = z.infer<typeof videoAiNodeSchema>;
export type VideoAiRenderableNode = Exclude<VideoAiNode, { type: "repeat" }>;
export type ExpandedVideoAiScene = Omit<VideoAiScene, "nodes"> & {
  nodes: Record<string, VideoAiRenderableNode>;
};
export type VideoArrowEndpointRef = z.infer<typeof videoArrowEndpointRefSchema>;
export type VideoArrowNode = z.infer<typeof videoArrowNodeSchema>;
export type VideoArrowPosition = z.infer<typeof videoArrowPositionSchema>;
export type VideoCircleNode = z.infer<typeof videoCircleNodeSchema>;
export type VideoIconLineCap = z.infer<typeof videoIconLineCapSchema>;
export type VideoIconLineJoin = z.infer<typeof videoIconLineJoinSchema>;
export type VideoIconNode = z.infer<typeof videoIconNodeSchema>;
export type VideoIconPrimitive = z.infer<typeof videoIconPrimitiveSchema>;
export type VideoLineNode = z.infer<typeof videoLineNodeSchema>;
export type VideoNode = z.infer<typeof videoNodeSchema>;
export type VideoPoint = z.infer<typeof videoPointSchema>;
export type VideoVector = z.infer<typeof videoVectorSchema>;
export type VideoRepeatNode = z.infer<typeof videoRepeatNodeSchema>;
export type VideoScene = z.infer<typeof videoSceneSchema>;
export type VideoStackAlign = z.infer<typeof videoStackAlignSchema>;
export type VideoStackDirection = z.infer<typeof videoStackDirectionSchema>;
export type VideoTextAlign = z.infer<typeof videoTextAlignSchema>;
export type VideoTimelineEvent = z.infer<typeof videoTimelineEventSchema>;

export type VideoAlignNode = z.infer<typeof videoAlignNodeSchema>;
export type VideoCenterNode = z.infer<typeof videoCenterNodeSchema>;
export type VideoRectNode = Extract<VideoNode, { type: "rect" }>;
export type VideoStackNode = z.infer<typeof videoStackNodeSchema>;
export type VideoTextNode = Extract<VideoNode, { type: "text" }>;

export interface RenderOutputTarget {
  filePath: string;
  jobId: string;
  publicUrl: string | null;
}

export interface VideoTimingMetrics {
  encodeMs: number;
  renderMs: number;
}

export interface RenderVideoOptions {
  codec?: string;
  jobId?: string;
  outputFilePath?: string;
}

export interface RenderedVideoResult extends RenderOutputTarget {
  codec: string;
  fps: number;
  frameCount: number;
  height: number;
  timings: VideoTimingMetrics;
  width: number;
}
