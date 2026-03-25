import type { z } from "zod";

import type {
  videoAnchorSchema,
  videoColorAnimationValueSchema,
  videoDescriptionSchema,
  videoEasingSchema,
  videoHexColorSchema,
  videoImageFitSchema,
  videoNodeSchema,
  videoNumericAnimationValueSchema,
  videoPrimitiveSchema,
  videoSceneSchema,
  videoTextAlignSchema,
  videoTimeSchema,
} from "@/lib/video/schema";

export type VideoAnchor = z.infer<typeof videoAnchorSchema>;
export type VideoColor = z.infer<typeof videoHexColorSchema>;
export type VideoDescription = z.infer<typeof videoDescriptionSchema>;
export type VideoEasingName = z.infer<typeof videoEasingSchema>;
export type VideoImageFit = z.infer<typeof videoImageFitSchema>;
export type VideoNode = z.infer<typeof videoNodeSchema>;
export type VideoPrimitive = z.infer<typeof videoPrimitiveSchema>;
export type VideoColorAnimationValue = z.infer<
  typeof videoColorAnimationValueSchema
>;
export type VideoNumericAnimationValue = z.infer<
  typeof videoNumericAnimationValueSchema
>;
type ExtractAnimationStep<TValue> =
  TValue extends Array<infer TStep> ? TStep : TValue;
export type VideoColorAnimationStep =
  ExtractAnimationStep<VideoColorAnimationValue>;
export type VideoNumericAnimationStep =
  ExtractAnimationStep<VideoNumericAnimationValue>;
export type VideoScene = z.infer<typeof videoSceneSchema>;
export type VideoTextAlign = z.infer<typeof videoTextAlignSchema>;
export type VideoTimeValue = z.infer<typeof videoTimeSchema>;

export type VideoGroupNode = Extract<VideoNode, { type: "group" }>;
export type VideoImageNode = Extract<VideoNode, { type: "image" }>;
export type VideoRectNode = Extract<VideoNode, { type: "rect" }>;
export type VideoTextNode = Extract<VideoNode, { type: "text" }>;

export interface ResolvedNodeBase {
  anchor: VideoAnchor;
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

export type ResolvedVideoNode =
  | ResolvedGroupNode
  | ResolvedImageNode
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
