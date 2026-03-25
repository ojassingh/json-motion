import type { z } from "zod";

import type {
  videoAnchorSchema,
  videoDescriptionSchema,
  videoEasingSchema,
  videoHexColorSchema,
  videoImageFitSchema,
  videoNodeSchema,
  videoNodeStateSchema,
  videoNodeTransitionSchema,
  videoPrimitiveSchema,
  videoSceneSchema,
  videoStackAlignSchema,
  videoTextAlignSchema,
} from "@/lib/video/schema";

export type VideoAnchor = z.infer<typeof videoAnchorSchema>;
export type VideoColor = z.infer<typeof videoHexColorSchema>;
export type VideoDescription = z.infer<typeof videoDescriptionSchema>;
export type VideoEasingName = z.infer<typeof videoEasingSchema>;
export type VideoImageFit = z.infer<typeof videoImageFitSchema>;
export type VideoNode = z.infer<typeof videoNodeSchema>;
export type VideoNodeState = z.infer<typeof videoNodeStateSchema>;
export type VideoNodeTransition = z.infer<typeof videoNodeTransitionSchema>;
export type VideoPrimitive = z.infer<typeof videoPrimitiveSchema>;
export type VideoScene = z.infer<typeof videoSceneSchema>;
export type VideoStackAlign = z.infer<typeof videoStackAlignSchema>;
export type VideoTextAlign = z.infer<typeof videoTextAlignSchema>;

export type VideoAlignNode = Extract<VideoNode, { type: "align" }>;
export type VideoCenterNode = Extract<VideoNode, { type: "center" }>;
export type VideoFunctionGraphNode = Extract<
  VideoNode,
  { type: "functionGraph" }
>;
export type VideoGroupNode = Extract<VideoNode, { type: "group" }>;
export type VideoImageNode = Extract<VideoNode, { type: "image" }>;
export type VideoMathNode = Extract<VideoNode, { type: "math" }>;
export type VideoParametricGraphNode = Extract<
  VideoNode,
  { type: "parametricGraph" }
>;
export type VideoRectNode = Extract<VideoNode, { type: "rect" }>;
export type VideoStackNode = Extract<VideoNode, { type: "stack" }>;
export type VideoTextNode = Extract<VideoNode, { type: "text" }>;

export interface ResolvedNodeBase {
  anchor: VideoAnchor;
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

export interface ResolvedGroupNode extends ResolvedNodeBase {
  children: ResolvedVideoNode[];
  type: "group";
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

export interface ResolvedAlignNode extends ResolvedNodeBase {
  children: ResolvedVideoNode[];
  type: "align";
}

export interface ResolvedCenterNode extends ResolvedNodeBase {
  children: ResolvedVideoNode[];
  type: "center";
}

export interface ResolvedStackNode extends ResolvedNodeBase {
  children: ResolvedVideoNode[];
  type: "stack";
}

export type ResolvedVideoNode =
  | ResolvedAlignNode
  | ResolvedCenterNode
  | ResolvedFunctionGraphNode
  | ResolvedGroupNode
  | ResolvedImageNode
  | ResolvedMathNode
  | ResolvedParametricGraphNode
  | ResolvedRectNode
  | ResolvedStackNode
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
