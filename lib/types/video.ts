import type { z } from "zod";

import type {
  videoAiOutputSchema,
  videoAiSceneSchema,
  videoAnchorAlignSchema,
  videoAnchorEdgeSchema,
  videoAnchorSchema,
  videoDescriptionSchema,
  videoEasingSchema,
  videoHexColorSchema,
  videoImageFitSchema,
  videoNodeSchema,
  videoSceneSchema,
  videoTextAlignSchema,
  videoTimelineEventSchema,
} from "@/lib/video/schema";

export type VideoAiOutput = z.infer<typeof videoAiOutputSchema>;
export type VideoAiScene = z.infer<typeof videoAiSceneSchema>;
export type VideoAnchor = z.infer<typeof videoAnchorSchema>;
export type VideoAnchorAlign = z.infer<typeof videoAnchorAlignSchema>;
export type VideoAnchorEdge = z.infer<typeof videoAnchorEdgeSchema>;
export type VideoColor = z.infer<typeof videoHexColorSchema>;
export type VideoDescription = z.infer<typeof videoDescriptionSchema>;
export type VideoEasingName = z.infer<typeof videoEasingSchema>;
export type VideoImageFit = z.infer<typeof videoImageFitSchema>;
export type VideoNode = z.infer<typeof videoNodeSchema>;
export type VideoScene = z.infer<typeof videoSceneSchema>;
export type VideoTextAlign = z.infer<typeof videoTextAlignSchema>;
export type VideoTimelineEvent = z.infer<typeof videoTimelineEventSchema>;

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
export type VideoTextNode = Extract<VideoNode, { type: "text" }>;

// ---------------------------------------------------------------------------
// Resolved types — fully concrete values for a single frame
// ---------------------------------------------------------------------------

export interface ResolvedNodeBase {
  blur: number;
  id: string;
  opacity: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  skewX: number;
  skewY: number;
  sourceIndex: number;
  x: number;
  y: number;
  zIndex: number;
}

export interface ResolvedRectNode extends ResolvedNodeBase {
  fill?: VideoColor;
  height: number;
  radius: number;
  stroke?: VideoColor;
  strokeWidth: number;
  type: "rect";
  width: number;
}

export interface ResolvedTextNode extends ResolvedNodeBase {
  color: VideoColor;
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  lineHeight: number;
  maxWidth?: number;
  text: string;
  textAlign: VideoTextAlign;
  type: "text";
}

export interface ResolvedImageNode extends ResolvedNodeBase {
  fit: VideoImageFit;
  height: number;
  src: string;
  type: "image";
  width: number;
}

export interface ResolvedMathNode extends ResolvedNodeBase {
  color: VideoColor;
  fontSize: number;
  height: number;
  latex: string;
  type: "math";
  width: number;
}

export interface ResolvedFunctionGraphNode extends ResolvedNodeBase {
  color: VideoColor;
  drawProgress: number;
  height: number;
  showAxes: boolean;
  showGrid: boolean;
  strokeWidth: number;
  type: "functionGraph";
  width: number;
  xRange: number[];
  yRange: number[];
}

export interface ResolvedParametricGraphNode extends ResolvedNodeBase {
  color: VideoColor;
  drawProgress: number;
  height: number;
  strokeWidth: number;
  type: "parametricGraph";
  width: number;
}

export type ResolvedVideoNode =
  | ResolvedFunctionGraphNode
  | ResolvedImageNode
  | ResolvedMathNode
  | ResolvedParametricGraphNode
  | ResolvedRectNode
  | ResolvedTextNode;

export interface ResolvedFrame {
  absoluteFrame: number;
  background: VideoColor;
  localFrame: number | null;
  nodes: ResolvedVideoNode[];
  scene: VideoScene | null;
}

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
