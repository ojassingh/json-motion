export type VideoColor =
  | `#${string}`
  | `rgb(${string})`
  | `rgba(${string})`
  | `hsl(${string})`
  | `hsla(${string})`
  | string;

export type VideoEasingName = "ease-in" | "ease-in-out" | "ease-out" | "linear";

export type VideoEffectName = "fade-in" | "scale-in" | "slide-in";

export type VideoImageFit = "contain" | "cover" | "fill";

export type VideoTextAlign = "center" | "left" | "right";

export type NumericAnimationProperty =
  | "anchorX"
  | "anchorY"
  | "opacity"
  | "rotation"
  | "scaleX"
  | "scaleY"
  | "skewX"
  | "skewY"
  | "x"
  | "y";

export interface VideoNodeTransform {
  anchorX: number;
  anchorY: number;
  opacity: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  skewX: number;
  skewY: number;
  x: number;
  y: number;
  zIndex: number;
}

export type VideoNodeTransformInput = Partial<VideoNodeTransform>;

export interface VideoKeyframePoint {
  frame: number;
  value: number;
}

export interface VideoKeyframeAnimation {
  easing?: VideoEasingName;
  endFrame: number;
  keyframes: [VideoKeyframePoint, VideoKeyframePoint, ...VideoKeyframePoint[]];
  property: NumericAnimationProperty;
  startFrame: number;
  type: "keyframes";
}

export interface VideoFadeInEffect {
  easing?: VideoEasingName;
  endFrame: number;
  fromOpacity?: number;
  name: "fade-in";
  startFrame: number;
  type: "effect";
}

export interface VideoScaleInEffect {
  easing?: VideoEasingName;
  endFrame: number;
  fromScale?: number;
  name: "scale-in";
  startFrame: number;
  type: "effect";
}

export interface VideoSlideInEffect {
  easing?: VideoEasingName;
  endFrame: number;
  fromX?: number;
  fromY?: number;
  name: "slide-in";
  startFrame: number;
  type: "effect";
}

export type VideoNodeAnimation =
  | VideoFadeInEffect
  | VideoKeyframeAnimation
  | VideoScaleInEffect
  | VideoSlideInEffect;

export interface VideoNodeBase {
  animations?: VideoNodeAnimation[];
  id: string;
  transform?: VideoNodeTransformInput;
}

export interface VideoGroupNode extends VideoNodeBase {
  children: VideoNode[];
  type: "group";
}

export interface VideoRectNode extends VideoNodeBase {
  fill?: VideoColor;
  height: number;
  radius?: number;
  stroke?: VideoColor;
  strokeWidth?: number;
  type: "rect";
  width: number;
}

export interface VideoTextNode extends VideoNodeBase {
  color?: VideoColor;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;
  lineHeight?: number;
  maxWidth?: number;
  text: string;
  textAlign?: VideoTextAlign;
  type: "text";
}

export interface VideoImageNode extends VideoNodeBase {
  fit?: VideoImageFit;
  height: number;
  src: string;
  type: "image";
  width: number;
}

export type VideoNode =
  | VideoGroupNode
  | VideoImageNode
  | VideoRectNode
  | VideoTextNode;

export interface VideoScene {
  background?: VideoColor;
  durationInFrames: number;
  id: string;
  nodes: VideoNode[];
  startFrame: number;
}

export interface VideoDescription {
  background?: VideoColor;
  fps: number;
  height: number;
  scenes: [VideoScene, ...VideoScene[]];
  width: number;
}

export interface ResolvedNodeTransform extends VideoNodeTransform {
  animatedX: number;
  animatedY: number;
}

export interface ResolvedNodeBase {
  id: string;
  sourceIndex: number;
  transform: ResolvedNodeTransform;
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
