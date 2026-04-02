import type { z } from "zod";

import type {
  videoAiEquationNodeSchema,
  videoAiFunctionGraphNodeSchema,
  videoAiIconNodeSchema,
  videoAiNodeSchema,
  videoAiOutputSchema,
  videoAiParametricGraphNodeSchema,
  videoAiSceneSchema,
  videoAlignNodeSchema,
  videoAnchorSchema,
  videoCenterNodeSchema,
  videoCircleNodeSchema,
  videoDescriptionSchema,
  videoEasingSchema,
  videoFunctionGraphNodeSchema,
  videoHexColorSchema,
  videoIconLineCapSchema,
  videoIconLineJoinSchema,
  videoIconNodeSchema,
  videoIconPrimitiveSchema,
  videoLineEndpointRefSchema,
  videoLineHeadSchema,
  videoLineNodeSchema,
  videoNodeSchema,
  videoParametricGraphNodeSchema,
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
export type VideoAiFunctionGraphNode = z.infer<
  typeof videoAiFunctionGraphNodeSchema
>;
export type VideoAiIconNode = z.infer<typeof videoAiIconNodeSchema>;
export type VideoAiNode = z.infer<typeof videoAiNodeSchema>;
export type VideoAiParametricGraphNode = z.infer<
  typeof videoAiParametricGraphNodeSchema
>;
export type VideoAiRenderableNode = Exclude<VideoAiNode, { type: "repeat" }>;
export type ExpandedVideoAiScene = Omit<VideoAiScene, "nodes"> & {
  nodes: Record<string, VideoAiRenderableNode>;
};
export type VideoCircleNode = z.infer<typeof videoCircleNodeSchema>;
export type VideoFunctionGraphNode = z.infer<
  typeof videoFunctionGraphNodeSchema
>;
export type VideoIconLineCap = z.infer<typeof videoIconLineCapSchema>;
export type VideoIconLineJoin = z.infer<typeof videoIconLineJoinSchema>;
export type VideoIconNode = z.infer<typeof videoIconNodeSchema>;
export type VideoIconPrimitive = z.infer<typeof videoIconPrimitiveSchema>;
export type VideoLineEndpointRef = z.infer<typeof videoLineEndpointRefSchema>;
export type VideoLineHead = z.infer<typeof videoLineHeadSchema>;
export type VideoLineNode = z.infer<typeof videoLineNodeSchema>;
export type VideoNode = z.infer<typeof videoNodeSchema>;
export type VideoParametricGraphNode = z.infer<
  typeof videoParametricGraphNodeSchema
>;
export type VideoPoint = z.infer<typeof videoPointSchema>;
export type VideoVector = z.infer<typeof videoVectorSchema>;
export type VideoRepeatNode = z.infer<typeof videoRepeatNodeSchema>;
export type VideoScene = z.infer<typeof videoSceneSchema>;
export type VideoPrerenderNode =
  | Exclude<VideoNode, { type: "functionGraph" | "parametricGraph" }>
  | VideoAiFunctionGraphNode
  | VideoAiParametricGraphNode;
export type VideoPrerenderScene = Omit<VideoScene, "nodes"> & {
  nodes: Record<string, VideoPrerenderNode>;
};
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
