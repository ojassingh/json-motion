import type {
  ResolvedFrame,
  ResolvedGroupNode,
  ResolvedImageNode,
  ResolvedNodeTransform,
  ResolvedRectNode,
  ResolvedTextNode,
  ResolvedVideoNode,
  VideoDescription,
  VideoEasingName,
  VideoGroupNode,
  VideoImageNode,
  VideoKeyframeAnimation,
  VideoNode,
  VideoNodeAnimation,
  VideoNodeTransform,
  VideoNodeTransformInput,
  VideoRectNode,
  VideoScene,
  VideoTextNode,
} from "@/lib/types/video";
import {
  DEFAULT_SCENE_BACKGROUND,
  DEFAULT_TEXT_COLOR,
  DEFAULT_TEXT_FONT_FAMILY,
  DEFAULT_TEXT_FONT_SIZE,
  DEFAULT_TEXT_LINE_HEIGHT_MULTIPLIER,
} from "@/lib/video/config";
import {
  createEmptyResolvedFrame,
  getSceneForFrame,
  getSceneLocalFrame,
} from "@/lib/video/timeline";

const DEFAULT_NODE_TRANSFORM: VideoNodeTransform = {
  anchorX: 0,
  anchorY: 0,
  opacity: 1,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  skewX: 0,
  skewY: 0,
  x: 0,
  y: 0,
  zIndex: 0,
};

const getEasedProgress = (
  progress: number,
  easing: VideoEasingName
): number => {
  if (easing === "ease-in") {
    return progress * progress;
  }

  if (easing === "ease-out") {
    return 1 - (1 - progress) * (1 - progress);
  }

  if (easing === "ease-in-out") {
    if (progress < 0.5) {
      return 2 * progress * progress;
    }

    return 1 - (-2 * progress + 2) ** 2 / 2;
  }

  return progress;
};

const clampFrameProgress = (
  localFrame: number,
  startFrame: number,
  endFrame: number,
  easing: VideoEasingName = "linear"
): number => {
  if (endFrame === startFrame) {
    return 1;
  }

  const boundedProgress = Math.min(
    Math.max((localFrame - startFrame) / (endFrame - startFrame), 0),
    1
  );

  return getEasedProgress(boundedProgress, easing);
};

const interpolate = (from: number, to: number, progress: number): number =>
  from + (to - from) * progress;

const resolveKeyframeAnimationValue = (
  animation: VideoKeyframeAnimation,
  localFrame: number
): number | null => {
  if (localFrame < animation.startFrame) {
    return null;
  }

  const [firstKeyframe] = animation.keyframes;

  const lastKeyframe = animation.keyframes.at(-1);

  if (!lastKeyframe) {
    return firstKeyframe.value;
  }

  if (localFrame >= animation.endFrame) {
    return lastKeyframe.value;
  }

  if (localFrame <= firstKeyframe.frame) {
    return firstKeyframe.value;
  }

  for (let index = 0; index < animation.keyframes.length - 1; index += 1) {
    const currentKeyframe = animation.keyframes[index];
    const nextKeyframe = animation.keyframes[index + 1];

    if (localFrame <= nextKeyframe.frame) {
      const segmentProgress = clampFrameProgress(
        localFrame,
        currentKeyframe.frame,
        nextKeyframe.frame,
        animation.easing
      );

      return interpolate(
        currentKeyframe.value,
        nextKeyframe.value,
        segmentProgress
      );
    }
  }

  return lastKeyframe.value;
};

const applyNamedEffect = (
  animation: VideoNodeAnimation,
  localFrame: number,
  transform: ResolvedNodeTransform
): void => {
  if (animation.type !== "effect") {
    return;
  }

  const progress = clampFrameProgress(
    localFrame,
    animation.startFrame,
    animation.endFrame,
    animation.easing
  );

  if (animation.name === "fade-in") {
    const fromOpacity = animation.fromOpacity ?? 0;
    transform.opacity = interpolate(fromOpacity, transform.opacity, progress);
    return;
  }

  if (animation.name === "scale-in") {
    const fromScale = animation.fromScale ?? 0.85;
    transform.scaleX = interpolate(fromScale, transform.scaleX, progress);
    transform.scaleY = interpolate(fromScale, transform.scaleY, progress);
    return;
  }

  const fromX = animation.fromX ?? 0;
  const fromY = animation.fromY ?? 40;

  transform.animatedX += interpolate(fromX, 0, progress);
  transform.animatedY += interpolate(fromY, 0, progress);
};

export const normalizeNodeTransform = (
  transform: VideoNodeTransformInput | undefined
): VideoNodeTransform => ({
  ...DEFAULT_NODE_TRANSFORM,
  ...transform,
});

export const resolveNodeTransform = (
  node: VideoNode,
  localFrame: number
): ResolvedNodeTransform => {
  const resolvedTransform: ResolvedNodeTransform = {
    ...normalizeNodeTransform(node.transform),
    animatedX: 0,
    animatedY: 0,
  };

  for (const animation of node.animations ?? []) {
    if (animation.type === "keyframes") {
      const resolvedValue = resolveKeyframeAnimationValue(
        animation,
        localFrame
      );

      if (resolvedValue === null) {
        continue;
      }

      resolvedTransform[animation.property] = resolvedValue;
      continue;
    }

    applyNamedEffect(animation, localFrame, resolvedTransform);
  }

  return resolvedTransform;
};

const sortResolvedNodes = (nodes: ResolvedVideoNode[]): ResolvedVideoNode[] =>
  nodes.toSorted((leftNode, rightNode) => {
    const zIndexDifference =
      leftNode.transform.zIndex - rightNode.transform.zIndex;

    if (zIndexDifference !== 0) {
      return zIndexDifference;
    }

    return leftNode.sourceIndex - rightNode.sourceIndex;
  });

const resolveGroupNode = (
  node: VideoGroupNode,
  localFrame: number,
  sourceIndex: number
): ResolvedGroupNode => ({
  children: sortResolvedNodes(
    node.children.map((childNode, childIndex) =>
      resolveVideoNode(childNode, localFrame, childIndex)
    )
  ),
  id: node.id,
  sourceIndex,
  transform: resolveNodeTransform(node, localFrame),
  type: "group",
});

const resolveRectNode = (
  node: VideoRectNode,
  localFrame: number,
  sourceIndex: number
): ResolvedRectNode => ({
  fill: node.fill,
  height: node.height,
  id: node.id,
  radius: node.radius ?? 0,
  sourceIndex,
  stroke: node.stroke,
  strokeWidth: node.strokeWidth ?? 0,
  transform: resolveNodeTransform(node, localFrame),
  type: "rect",
  width: node.width,
});

const resolveTextNode = (
  node: VideoTextNode,
  localFrame: number,
  sourceIndex: number
): ResolvedTextNode => {
  const fontSize = node.fontSize ?? DEFAULT_TEXT_FONT_SIZE;
  const lineHeight =
    node.lineHeight ?? fontSize * DEFAULT_TEXT_LINE_HEIGHT_MULTIPLIER;

  return {
    color: node.color ?? DEFAULT_TEXT_COLOR,
    fontFamily: node.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY,
    fontSize,
    fontWeight: node.fontWeight ?? 600,
    id: node.id,
    lineHeight,
    maxWidth: node.maxWidth,
    sourceIndex,
    text: node.text,
    textAlign: node.textAlign ?? "left",
    transform: resolveNodeTransform(node, localFrame),
    type: "text",
  };
};

const resolveImageNode = (
  node: VideoImageNode,
  localFrame: number,
  sourceIndex: number
): ResolvedImageNode => ({
  fit: node.fit ?? "cover",
  height: node.height,
  id: node.id,
  sourceIndex,
  src: node.src,
  transform: resolveNodeTransform(node, localFrame),
  type: "image",
  width: node.width,
});

export const resolveVideoNode = (
  node: VideoNode,
  localFrame: number,
  sourceIndex: number
): ResolvedVideoNode => {
  if (node.type === "group") {
    return resolveGroupNode(node, localFrame, sourceIndex);
  }

  if (node.type === "rect") {
    return resolveRectNode(node, localFrame, sourceIndex);
  }

  if (node.type === "text") {
    return resolveTextNode(node, localFrame, sourceIndex);
  }

  return resolveImageNode(node, localFrame, sourceIndex);
};

export const resolveSceneNodes = (
  scene: VideoScene,
  localFrame: number
): ResolvedVideoNode[] =>
  sortResolvedNodes(
    scene.nodes.map((node, sourceIndex) =>
      resolveVideoNode(node, localFrame, sourceIndex)
    )
  );

export const resolveFrame = (
  videoDescription: VideoDescription,
  absoluteFrame: number
): ResolvedFrame => {
  const scene = getSceneForFrame(videoDescription, absoluteFrame);

  if (!scene) {
    return createEmptyResolvedFrame(videoDescription, absoluteFrame);
  }

  const localFrame = getSceneLocalFrame(scene, absoluteFrame);

  return {
    absoluteFrame,
    background:
      scene.background ??
      videoDescription.background ??
      DEFAULT_SCENE_BACKGROUND,
    localFrame,
    nodes: resolveSceneNodes(scene, localFrame),
    scene,
  };
};
