import type { z } from "zod";

import type {
  videoAiOutputSchema,
  videoAiSceneSchema,
  videoAlignNodeSchema,
  videoAnchorSchema,
  videoCenterNodeSchema,
  videoDescriptionSchema,
  videoEasingSchema,
  videoHexColorSchema,
  videoImageFitSchema,
  videoNodeSchema,
  videoSceneSchema,
  videoStackAlignSchema,
  videoStackDirectionSchema,
  videoStackNodeSchema,
  videoTextAlignSchema,
  videoTimelineEventSchema,
} from "@/lib/video/schema";

export type VideoAiOutput = z.infer<typeof videoAiOutputSchema>;
export type VideoAiScene = z.infer<typeof videoAiSceneSchema>;
export type VideoAnchor = z.infer<typeof videoAnchorSchema>;
export type VideoColor = z.infer<typeof videoHexColorSchema>;
export type VideoDescription = z.infer<typeof videoDescriptionSchema>;
export type VideoEasingName = z.infer<typeof videoEasingSchema>;
export type VideoImageFit = z.infer<typeof videoImageFitSchema>;
export type VideoNode = z.infer<typeof videoNodeSchema>;
export type VideoScene = z.infer<typeof videoSceneSchema>;
export type VideoStackAlign = z.infer<typeof videoStackAlignSchema>;
export type VideoStackDirection = z.infer<typeof videoStackDirectionSchema>;
export type VideoTextAlign = z.infer<typeof videoTextAlignSchema>;
export type VideoTimelineEvent = z.infer<typeof videoTimelineEventSchema>;

export type VideoAlignNode = z.infer<typeof videoAlignNodeSchema>;
export type VideoCenterNode = z.infer<typeof videoCenterNodeSchema>;
export type VideoFunctionGraphNode = Extract<
  VideoNode,
  { type: "functionGraph" }
>;
export type VideoImageNode = Extract<VideoNode, { type: "image" }>;
export type VideoMathNode = Extract<VideoNode, { type: "math" }>;
export type VideoParametricGraphNode = Extract<
  VideoNode,
  { type: "parametricGraph" }
>;
export type VideoRectNode = Extract<VideoNode, { type: "rect" }>;
export type VideoStackNode = z.infer<typeof videoStackNodeSchema>;
export type VideoTextNode = Extract<VideoNode, { type: "text" }>;

export interface RenderOutputTarget {
  filePath: string;
  jobId: string;
  publicUrl: string | null;
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
  width: number;
}
