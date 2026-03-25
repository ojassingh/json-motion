import type {
  ResolvedAlignNode,
  ResolvedCenterNode,
  ResolvedFrame,
  ResolvedFunctionGraphNode,
  ResolvedGroupNode,
  ResolvedImageNode,
  ResolvedMathNode,
  ResolvedParametricGraphNode,
  ResolvedRectNode,
  ResolvedStackNode,
  ResolvedTextNode,
  ResolvedVideoNode,
  VideoAlignNode,
  VideoCenterNode,
  VideoColor,
  VideoDescription,
  VideoEasingName,
  VideoFunctionGraphNode,
  VideoGroupNode,
  VideoImageNode,
  VideoMathNode,
  VideoNode,
  VideoParametricGraphNode,
  VideoRectNode,
  VideoScene,
  VideoStackNode,
  VideoTextNode,
} from "@/lib/types/video";
import { lerpOklch } from "@/lib/video/color";
import {
  DEFAULT_SCENE_BACKGROUND,
  DEFAULT_TEXT_COLOR,
  DEFAULT_TEXT_FONT_FAMILY,
  DEFAULT_TEXT_FONT_SIZE,
  DEFAULT_TEXT_LINE_HEIGHT_MULTIPLIER,
} from "@/lib/video/config";
import { resolveLayout } from "@/lib/video/layout";
import { resolveMathDimensions } from "@/lib/video/math";
import type { PreRenderCaches } from "@/lib/video/pre-render";
import {
  createEmptyResolvedFrame,
  getSceneForFrame,
  getSceneLocalFrame,
} from "@/lib/video/timeline";

type ColorAnimationProperty = "background" | "color" | "fill" | "stroke";
type NumericAnimationProperty =
  | "blur"
  | "drawProgress"
  | "fontSize"
  | "height"
  | "opacity"
  | "radius"
  | "rotation"
  | "scaleX"
  | "scaleY"
  | "skewX"
  | "skewY"
  | "strokeWidth"
  | "width"
  | "x"
  | "y";

export interface NormalizedAnimationSegment<TValue extends number | string> {
  easing: VideoEasingName;
  endFrame: number;
  from: TValue;
  startFrame: number;
  to: TValue;
}

export interface NormalizedNodeAnimations {
  colors: Partial<
    Record<ColorAnimationProperty, NormalizedAnimationSegment<VideoColor>[]>
  >;
  numbers: Partial<
    Record<NumericAnimationProperty, NormalizedAnimationSegment<number>[]>
  >;
}

const DEFAULT_ENTER_DURATION = 12;
const DEFAULT_POP_DURATION = 12;
const DEFAULT_WIGGLE_DURATION = 24;
const DEFAULT_DRAW_DURATION = 60;

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
    return progress < 0.5
      ? 2 * progress * progress
      : 1 - (-2 * progress + 2) ** 2 / 2;
  }
  if (easing === "ease-in-expo") {
    return progress === 0 ? 0 : 2 ** (10 * progress - 10);
  }
  if (easing === "ease-out-expo") {
    return progress === 1 ? 1 : 1 - 2 ** (-10 * progress);
  }
  if (easing === "ease-in-back") {
    const c = 1.701_58;
    return (c + 1) * progress ** 3 - c * progress ** 2;
  }
  if (easing === "ease-out-back") {
    const c = 1.701_58;
    const p = progress - 1;
    return 1 + (c + 1) * p ** 3 + c * p ** 2;
  }
  if (easing === "spring") {
    return 1 - Math.exp(-6 * progress) * Math.cos(progress * 10);
  }
  return progress;
};

const interpolate = (from: number, to: number, progress: number): number =>
  from + (to - from) * progress;

const secondsToFrames = (value: string, fps: number): number =>
  Math.round(Number.parseFloat(value.slice(0, -1)) * fps);

const appendNumericSegments = (
  target: NormalizedNodeAnimations["numbers"],
  property: NumericAnimationProperty,
  segments: NormalizedAnimationSegment<number>[]
): void => {
  const existing = target[property] ?? [];
  target[property] = [...existing, ...segments];
};

const getBaseNodeValues = (node: VideoNode) => {
  const uniformScale = node.scale ?? 1;
  return {
    anchor: node.anchor ?? "center",
    blur: 0,
    drawProgress:
      node.type === "functionGraph" || node.type === "parametricGraph"
        ? (node.drawProgress ?? 1)
        : undefined,
    opacity: node.opacity ?? 1,
    rotation: node.rotate ?? 0,
    scaleX: node.scaleX ?? uniformScale,
    scaleY: node.scaleY ?? uniformScale,
    skewX: node.skewX ?? 0,
    skewY: node.skewY ?? 0,
    x: node.x ?? 0,
    y: node.y ?? 0,
    zIndex: node.zIndex ?? 0,
  };
};

const clampPrimitiveSegment = (
  segment: NormalizedAnimationSegment<number>,
  sceneDuration: number
): NormalizedAnimationSegment<number> | null => {
  const lastFrame = sceneDuration - 1;
  const startFrame = Math.max(segment.startFrame, 0);
  const endFrame = Math.min(segment.endFrame, lastFrame);
  if (startFrame > endFrame) {
    return null;
  }
  return { ...segment, endFrame, startFrame };
};

const createPrimitiveSegment = (
  from: number,
  to: number,
  startFrame: number,
  endFrame: number,
  sceneDuration: number,
  easing: VideoEasingName
): NormalizedAnimationSegment<number> | null =>
  clampPrimitiveSegment(
    { easing, endFrame, from, startFrame, to },
    sceneDuration
  );

const filterValidSegments = (
  segments: Array<NormalizedAnimationSegment<number> | null>
): NormalizedAnimationSegment<number>[] =>
  segments.filter((s): s is NormalizedAnimationSegment<number> => s !== null);

const getPopScaleSegments = (
  baseScale: number,
  sceneDuration: number
): NormalizedAnimationSegment<number>[] => {
  const mid = Math.max(Math.floor(DEFAULT_POP_DURATION / 2) - 1, 0);
  return filterValidSegments([
    createPrimitiveSegment(
      baseScale,
      baseScale * 1.08,
      0,
      mid,
      sceneDuration,
      "ease-out-back"
    ),
    createPrimitiveSegment(
      baseScale * 1.08,
      baseScale,
      mid + 1,
      DEFAULT_POP_DURATION - 1,
      sceneDuration,
      "ease-in-out"
    ),
  ]);
};

const getWiggleRotationSegments = (
  rotation: number,
  sceneDuration: number
): NormalizedAnimationSegment<number>[] =>
  filterValidSegments([
    createPrimitiveSegment(
      rotation,
      rotation - 4,
      0,
      5,
      sceneDuration,
      "ease-in-out"
    ),
    createPrimitiveSegment(
      rotation - 4,
      rotation + 4,
      6,
      11,
      sceneDuration,
      "ease-in-out"
    ),
    createPrimitiveSegment(
      rotation + 4,
      rotation - 2,
      12,
      17,
      sceneDuration,
      "ease-in-out"
    ),
    createPrimitiveSegment(
      rotation - 2,
      rotation,
      18,
      DEFAULT_WIGGLE_DURATION - 1,
      sceneDuration,
      "ease-in-out"
    ),
  ]);

const getPrimitiveNumericEntries = (
  primitive: NonNullable<VideoNode["primitives"]>[number],
  baseValues: ReturnType<typeof getBaseNodeValues>,
  sceneDuration: number
): Array<{
  property: NumericAnimationProperty;
  segments: NormalizedAnimationSegment<number>[];
}> => {
  const lastFrame = sceneDuration - 1;

  if (primitive === "BlurFadeIn") {
    return [
      {
        property: "opacity",
        segments: filterValidSegments([
          createPrimitiveSegment(
            0,
            baseValues.opacity,
            0,
            DEFAULT_ENTER_DURATION - 1,
            sceneDuration,
            "ease-out"
          ),
        ]),
      },
      {
        property: "blur",
        segments: filterValidSegments([
          createPrimitiveSegment(
            8,
            0,
            0,
            DEFAULT_ENTER_DURATION - 1,
            sceneDuration,
            "ease-out"
          ),
        ]),
      },
    ];
  }

  if (primitive === "DrawIn") {
    if (baseValues.drawProgress === undefined) {
      return [];
    }
    return [
      {
        property: "drawProgress",
        segments: filterValidSegments([
          createPrimitiveSegment(
            0,
            baseValues.drawProgress,
            0,
            DEFAULT_DRAW_DURATION - 1,
            sceneDuration,
            "ease-in-out"
          ),
        ]),
      },
    ];
  }

  if (primitive === "FadeIn") {
    return [
      {
        property: "opacity",
        segments: filterValidSegments([
          createPrimitiveSegment(
            0,
            baseValues.opacity,
            0,
            DEFAULT_ENTER_DURATION - 1,
            sceneDuration,
            "ease-out"
          ),
        ]),
      },
    ];
  }

  if (primitive === "FadeOut") {
    return [
      {
        property: "opacity",
        segments: filterValidSegments([
          createPrimitiveSegment(
            baseValues.opacity,
            0,
            Math.max(lastFrame - DEFAULT_ENTER_DURATION + 1, 0),
            lastFrame,
            sceneDuration,
            "ease-in"
          ),
        ]),
      },
    ];
  }

  if (primitive === "SlideIn") {
    return [
      {
        property: "y",
        segments: filterValidSegments([
          createPrimitiveSegment(
            baseValues.y + 40,
            baseValues.y,
            0,
            DEFAULT_ENTER_DURATION - 1,
            sceneDuration,
            "ease-out"
          ),
        ]),
      },
    ];
  }

  if (primitive === "ScaleIn") {
    return [
      {
        property: "scaleX",
        segments: filterValidSegments([
          createPrimitiveSegment(
            baseValues.scaleX * 0.85,
            baseValues.scaleX,
            0,
            DEFAULT_ENTER_DURATION - 1,
            sceneDuration,
            "ease-out"
          ),
        ]),
      },
      {
        property: "scaleY",
        segments: filterValidSegments([
          createPrimitiveSegment(
            baseValues.scaleY * 0.85,
            baseValues.scaleY,
            0,
            DEFAULT_ENTER_DURATION - 1,
            sceneDuration,
            "ease-out"
          ),
        ]),
      },
    ];
  }

  if (primitive === "Pop") {
    return [
      {
        property: "scaleX",
        segments: getPopScaleSegments(baseValues.scaleX, sceneDuration),
      },
      {
        property: "scaleY",
        segments: getPopScaleSegments(baseValues.scaleY, sceneDuration),
      },
    ];
  }

  return [
    {
      property: "rotation",
      segments: getWiggleRotationSegments(baseValues.rotation, sceneDuration),
    },
  ];
};

const getPrimitiveAnimations = (
  node: VideoNode,
  sceneDuration: number
): NormalizedNodeAnimations => {
  const animations: NormalizedNodeAnimations = { colors: {}, numbers: {} };
  const baseValues = getBaseNodeValues(node);
  for (const primitive of node.primitives ?? []) {
    for (const entry of getPrimitiveNumericEntries(
      primitive,
      baseValues,
      sceneDuration
    )) {
      appendNumericSegments(animations.numbers, entry.property, entry.segments);
    }
  }
  return animations;
};

interface SimpleAnimProp {
  defaultVal: (n: VideoNode) => number;
  resultKey: NumericAnimationProperty;
  stateKey: "blur" | "opacity" | "rotate" | "skewX" | "skewY" | "x" | "y";
}

const SIMPLE_ANIM_PROPS: SimpleAnimProp[] = [
  {
    defaultVal: (n) => n.opacity ?? 1,
    resultKey: "opacity",
    stateKey: "opacity",
  },
  { defaultVal: (n) => n.x ?? 0, resultKey: "x", stateKey: "x" },
  { defaultVal: (n) => n.y ?? 0, resultKey: "y", stateKey: "y" },
  {
    defaultVal: (n) => n.rotate ?? 0,
    resultKey: "rotation",
    stateKey: "rotate",
  },
  { defaultVal: () => 0, resultKey: "blur", stateKey: "blur" },
  { defaultVal: (n) => n.skewX ?? 0, resultKey: "skewX", stateKey: "skewX" },
  { defaultVal: (n) => n.skewY ?? 0, resultKey: "skewY", stateKey: "skewY" },
];

const applyEnterScale = (
  result: NormalizedNodeAnimations["numbers"],
  initial: { scale?: number; scaleX?: number; scaleY?: number },
  node: VideoNode,
  startFrame: number,
  endFrame: number,
  easing: VideoEasingName
): void => {
  const uniformScale = node.scale ?? 1;
  if (initial.scale !== undefined && !initial.scaleX) {
    result.scaleX = [
      {
        easing,
        endFrame,
        from: initial.scale,
        startFrame,
        to: node.scaleX ?? uniformScale,
      },
    ];
  }
  if (initial.scale !== undefined && !initial.scaleY) {
    result.scaleY = [
      {
        easing,
        endFrame,
        from: initial.scale,
        startFrame,
        to: node.scaleY ?? uniformScale,
      },
    ];
  }
  if (initial.scaleX !== undefined) {
    result.scaleX = [
      {
        easing,
        endFrame,
        from: initial.scaleX,
        startFrame,
        to: node.scaleX ?? uniformScale,
      },
    ];
  }
  if (initial.scaleY !== undefined) {
    result.scaleY = [
      {
        easing,
        endFrame,
        from: initial.scaleY,
        startFrame,
        to: node.scaleY ?? uniformScale,
      },
    ];
  }
};

const applyExitScale = (
  result: NormalizedNodeAnimations["numbers"],
  exit: { scale?: number; scaleX?: number; scaleY?: number },
  node: VideoNode,
  startFrame: number,
  endFrame: number,
  easing: VideoEasingName
): void => {
  const uniformScale = node.scale ?? 1;
  if (exit.scale !== undefined && !exit.scaleX) {
    result.scaleX = [
      {
        easing,
        endFrame,
        from: node.scaleX ?? uniformScale,
        startFrame,
        to: exit.scale,
      },
    ];
  }
  if (exit.scale !== undefined && !exit.scaleY) {
    result.scaleY = [
      {
        easing,
        endFrame,
        from: node.scaleY ?? uniformScale,
        startFrame,
        to: exit.scale,
      },
    ];
  }
  if (exit.scaleX !== undefined) {
    result.scaleX = [
      {
        easing,
        endFrame,
        from: node.scaleX ?? uniformScale,
        startFrame,
        to: exit.scaleX,
      },
    ];
  }
  if (exit.scaleY !== undefined) {
    result.scaleY = [
      {
        easing,
        endFrame,
        from: node.scaleY ?? uniformScale,
        startFrame,
        to: exit.scaleY,
      },
    ];
  }
};

/**
 * Builds enter animation segments from `initial` + `transition`.
 * The engine computes start/end frames — the AI only provides seconds.
 */
const getEnterAnimations = (
  node: VideoNode,
  fps: number,
  sceneDuration: number
): NormalizedNodeAnimations["numbers"] => {
  const { initial, transition } = node;
  if (!(initial && transition)) {
    return {};
  }

  const delay = transition.delay ? secondsToFrames(transition.delay, fps) : 0;
  const duration = secondsToFrames(transition.duration, fps);
  const startFrame = delay;
  const endFrame = Math.min(delay + duration, sceneDuration - 1);
  const easing = transition.easing ?? "ease-out";
  const result: NormalizedNodeAnimations["numbers"] = {};

  for (const { stateKey, resultKey, defaultVal } of SIMPLE_ANIM_PROPS) {
    const val = initial[stateKey];
    if (val !== undefined) {
      result[resultKey] = [
        { easing, endFrame, from: val, startFrame, to: defaultVal(node) },
      ];
    }
  }

  applyEnterScale(result, initial, node, startFrame, endFrame, easing);
  return result;
};

/**
 * Builds exit animation segments from `exit` + `exitTransition`.
 * The exit window is anchored to the end of the scene.
 */
const getExitAnimations = (
  node: VideoNode,
  fps: number,
  sceneDuration: number
): NormalizedNodeAnimations["numbers"] => {
  const { exit, exitTransition } = node;
  if (!(exit && exitTransition)) {
    return {};
  }

  const duration = secondsToFrames(exitTransition.duration, fps);
  const endFrame = sceneDuration - 1;
  const startFrame = Math.max(0, sceneDuration - duration);
  const easing = exitTransition.easing ?? "ease-in";
  const result: NormalizedNodeAnimations["numbers"] = {};

  for (const { stateKey, resultKey, defaultVal } of SIMPLE_ANIM_PROPS) {
    const val = exit[stateKey];
    if (val !== undefined) {
      result[resultKey] = [
        { easing, endFrame, from: defaultVal(node), startFrame, to: val },
      ];
    }
  }

  applyExitScale(result, exit, node, startFrame, endFrame, easing);
  return result;
};

/**
 * Merges primitive, enter, and exit animations with clear precedence:
 * - Explicit enter overrides primitives for the same property.
 * - Explicit exit appends to the result (enter + primitive) since they
 *   cover different time windows and should both play.
 */
const mergeNodeAnimations = (
  primitive: NormalizedNodeAnimations,
  enter: NormalizedNodeAnimations["numbers"],
  exit: NormalizedNodeAnimations["numbers"]
): NormalizedNodeAnimations => {
  const numbers: NormalizedNodeAnimations["numbers"] = { ...primitive.numbers };

  for (const key of Object.keys(enter) as NumericAnimationProperty[]) {
    numbers[key] = enter[key];
  }

  for (const key of Object.keys(exit) as NumericAnimationProperty[]) {
    const existing = numbers[key] ?? [];
    numbers[key] = [...existing, ...(exit[key] ?? [])];
  }

  return { colors: primitive.colors, numbers };
};

export const normalizeNodeAnimations = (
  node: VideoNode,
  fps: number,
  sceneDuration: number
): NormalizedNodeAnimations =>
  mergeNodeAnimations(
    getPrimitiveAnimations(node, sceneDuration),
    getEnterAnimations(node, fps, sceneDuration),
    getExitAnimations(node, fps, sceneDuration)
  );

const sortResolvedNodes = (nodes: ResolvedVideoNode[]): ResolvedVideoNode[] =>
  nodes.toSorted((a, b) => {
    const diff = a.zIndex - b.zIndex;
    return diff === 0 ? a.sourceIndex - b.sourceIndex : diff;
  });

const resolveAnimationProgress = (
  frame: number,
  segment: NormalizedAnimationSegment<number | string>
): number => {
  if (segment.startFrame === segment.endFrame) {
    return 1;
  }
  const boundedProgress = Math.min(
    Math.max(
      (frame - segment.startFrame) / (segment.endFrame - segment.startFrame),
      0
    ),
    1
  );
  return getEasedProgress(boundedProgress, segment.easing);
};

const resolveAnimatedNumericValue = (
  baseValue: number,
  segments: NormalizedAnimationSegment<number>[] | undefined,
  frame: number
): number => {
  if (!segments || segments.length === 0) {
    return baseValue;
  }

  let resolvedValue = baseValue;
  for (const segment of segments) {
    if (frame < segment.startFrame) {
      return resolvedValue;
    }
    if (frame <= segment.endFrame) {
      return interpolate(
        segment.from,
        segment.to,
        resolveAnimationProgress(frame, segment)
      );
    }
    resolvedValue = segment.to;
  }
  return resolvedValue;
};

const resolveAnimatedColorValue = (
  baseValue: VideoColor | undefined,
  segments: NormalizedAnimationSegment<VideoColor>[] | undefined,
  frame: number
): VideoColor | undefined => {
  if (!segments || segments.length === 0) {
    return baseValue;
  }

  let resolvedValue = baseValue ?? segments[0]?.from;
  for (const segment of segments) {
    if (frame < segment.startFrame) {
      return resolvedValue;
    }
    if (frame <= segment.endFrame) {
      return lerpOklch(
        segment.from,
        segment.to,
        resolveAnimationProgress(frame, segment)
      );
    }
    resolvedValue = segment.to;
  }
  return resolvedValue;
};

const resolveBaseNode = (
  node: VideoNode,
  fps: number,
  sceneDuration: number,
  localFrame: number,
  sourceIndex: number
) => {
  const baseValues = getBaseNodeValues(node);
  const animations = normalizeNodeAnimations(node, fps, sceneDuration);

  return {
    anchor: baseValues.anchor,
    blur: resolveAnimatedNumericValue(
      baseValues.blur,
      animations.numbers.blur,
      localFrame
    ),
    id: node.id,
    opacity: resolveAnimatedNumericValue(
      baseValues.opacity,
      animations.numbers.opacity,
      localFrame
    ),
    rotation: resolveAnimatedNumericValue(
      baseValues.rotation,
      animations.numbers.rotation,
      localFrame
    ),
    scaleX: resolveAnimatedNumericValue(
      baseValues.scaleX,
      animations.numbers.scaleX,
      localFrame
    ),
    scaleY: resolveAnimatedNumericValue(
      baseValues.scaleY,
      animations.numbers.scaleY,
      localFrame
    ),
    skewX: resolveAnimatedNumericValue(
      baseValues.skewX,
      animations.numbers.skewX,
      localFrame
    ),
    skewY: resolveAnimatedNumericValue(
      baseValues.skewY,
      animations.numbers.skewY,
      localFrame
    ),
    sourceIndex,
    x: resolveAnimatedNumericValue(
      baseValues.x,
      animations.numbers.x,
      localFrame
    ),
    y: resolveAnimatedNumericValue(
      baseValues.y,
      animations.numbers.y,
      localFrame
    ),
    zIndex: baseValues.zIndex,
  };
};

const resolveChildNodes = (
  children: VideoNode[],
  fps: number,
  sceneDuration: number,
  localFrame: number,
  caches?: PreRenderCaches
): ResolvedVideoNode[] =>
  sortResolvedNodes(
    children.map((child, i) =>
      resolveVideoNode(child, fps, sceneDuration, localFrame, i, caches)
    )
  );

const resolveGroupNode = (
  node: VideoGroupNode,
  fps: number,
  sceneDuration: number,
  localFrame: number,
  sourceIndex: number,
  caches?: PreRenderCaches
): ResolvedGroupNode => ({
  ...resolveBaseNode(node, fps, sceneDuration, localFrame, sourceIndex),
  children: resolveChildNodes(
    node.children,
    fps,
    sceneDuration,
    localFrame,
    caches
  ),
  type: "group",
});

const resolveCenterNode = (
  node: VideoCenterNode,
  fps: number,
  sceneDuration: number,
  localFrame: number,
  sourceIndex: number,
  caches?: PreRenderCaches
): ResolvedCenterNode => ({
  ...resolveBaseNode(node, fps, sceneDuration, localFrame, sourceIndex),
  children: resolveChildNodes(
    node.children,
    fps,
    sceneDuration,
    localFrame,
    caches
  ),
  type: "center",
});

const resolveStackNode = (
  node: VideoStackNode,
  fps: number,
  sceneDuration: number,
  localFrame: number,
  sourceIndex: number,
  caches?: PreRenderCaches
): ResolvedStackNode => ({
  ...resolveBaseNode(node, fps, sceneDuration, localFrame, sourceIndex),
  children: resolveChildNodes(
    node.children,
    fps,
    sceneDuration,
    localFrame,
    caches
  ),
  type: "stack",
});

const resolveAlignNode = (
  node: VideoAlignNode,
  fps: number,
  sceneDuration: number,
  localFrame: number,
  sourceIndex: number,
  caches?: PreRenderCaches
): ResolvedAlignNode => ({
  ...resolveBaseNode(node, fps, sceneDuration, localFrame, sourceIndex),
  children: resolveChildNodes(
    node.children,
    fps,
    sceneDuration,
    localFrame,
    caches
  ),
  type: "align",
});

const resolveRectNode = (
  node: VideoRectNode,
  fps: number,
  sceneDuration: number,
  localFrame: number,
  sourceIndex: number
): ResolvedRectNode => {
  const animations = normalizeNodeAnimations(node, fps, sceneDuration);
  return {
    ...resolveBaseNode(node, fps, sceneDuration, localFrame, sourceIndex),
    fill: resolveAnimatedColorValue(
      node.fill,
      animations.colors.fill,
      localFrame
    ),
    height: resolveAnimatedNumericValue(
      node.height,
      animations.numbers.height,
      localFrame
    ),
    radius: resolveAnimatedNumericValue(
      node.cornerRadius ?? 0,
      animations.numbers.radius,
      localFrame
    ),
    stroke: resolveAnimatedColorValue(
      node.stroke,
      animations.colors.stroke,
      localFrame
    ),
    strokeWidth: resolveAnimatedNumericValue(
      node.strokeWidth ?? 0,
      animations.numbers.strokeWidth,
      localFrame
    ),
    type: "rect",
    width: resolveAnimatedNumericValue(
      node.width,
      animations.numbers.width,
      localFrame
    ),
  };
};

const resolveTextNode = (
  node: VideoTextNode,
  fps: number,
  sceneDuration: number,
  localFrame: number,
  sourceIndex: number
): ResolvedTextNode => {
  const animations = normalizeNodeAnimations(node, fps, sceneDuration);
  const fontSize = resolveAnimatedNumericValue(
    node.size ?? DEFAULT_TEXT_FONT_SIZE,
    animations.numbers.fontSize,
    localFrame
  );
  return {
    ...resolveBaseNode(node, fps, sceneDuration, localFrame, sourceIndex),
    color:
      resolveAnimatedColorValue(
        node.color ?? DEFAULT_TEXT_COLOR,
        animations.colors.color,
        localFrame
      ) ?? DEFAULT_TEXT_COLOR,
    fontFamily: node.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY,
    fontSize,
    fontWeight: node.fontWeight ?? 600,
    lineHeight:
      node.lineHeight ?? fontSize * DEFAULT_TEXT_LINE_HEIGHT_MULTIPLIER,
    maxWidth: node.maxWidth,
    text: node.text,
    textAlign: node.textAlign ?? "left",
    type: "text",
  };
};

const resolveImageNode = (
  node: VideoImageNode,
  fps: number,
  sceneDuration: number,
  localFrame: number,
  sourceIndex: number
): ResolvedImageNode => {
  const animations = normalizeNodeAnimations(node, fps, sceneDuration);
  return {
    ...resolveBaseNode(node, fps, sceneDuration, localFrame, sourceIndex),
    fit: node.fit ?? "cover",
    height: resolveAnimatedNumericValue(
      node.height,
      animations.numbers.height,
      localFrame
    ),
    src: node.src,
    type: "image",
    width: resolveAnimatedNumericValue(
      node.width,
      animations.numbers.width,
      localFrame
    ),
  };
};

const DEFAULT_MATH_COLOR = "#f8fafc";
const DEFAULT_GRAPH_COLOR = "#f8fafc";
const DEFAULT_STROKE_WIDTH = 2;

const resolveMathNode = (
  node: VideoMathNode,
  fps: number,
  sceneDuration: number,
  localFrame: number,
  sourceIndex: number,
  caches?: PreRenderCaches
): ResolvedMathNode => {
  const animations = normalizeNodeAnimations(node, fps, sceneDuration);
  const { height, width } = resolveMathDimensions(node, caches?.mathImages);
  return {
    ...resolveBaseNode(node, fps, sceneDuration, localFrame, sourceIndex),
    color:
      resolveAnimatedColorValue(
        node.color ?? DEFAULT_MATH_COLOR,
        animations.colors.color,
        localFrame
      ) ?? DEFAULT_MATH_COLOR,
    fontSize: node.fontSize,
    height,
    latex: node.latex,
    type: "math",
    width,
  };
};

const resolveFunctionGraphNode = (
  node: VideoFunctionGraphNode,
  fps: number,
  sceneDuration: number,
  localFrame: number,
  sourceIndex: number
): ResolvedFunctionGraphNode => {
  const animations = normalizeNodeAnimations(node, fps, sceneDuration);
  return {
    ...resolveBaseNode(node, fps, sceneDuration, localFrame, sourceIndex),
    color:
      resolveAnimatedColorValue(
        node.color ?? DEFAULT_GRAPH_COLOR,
        animations.colors.color,
        localFrame
      ) ?? DEFAULT_GRAPH_COLOR,
    drawProgress: resolveAnimatedNumericValue(
      node.drawProgress ?? 1,
      animations.numbers.drawProgress,
      localFrame
    ),
    height: node.height,
    showAxes: node.showAxes ?? false,
    showGrid: node.showGrid ?? false,
    strokeWidth: resolveAnimatedNumericValue(
      node.strokeWidth ?? DEFAULT_STROKE_WIDTH,
      animations.numbers.strokeWidth,
      localFrame
    ),
    type: "functionGraph",
    width: node.width,
    xRange: node.xRange,
    yRange: node.yRange,
  };
};

const resolveParametricGraphNode = (
  node: VideoParametricGraphNode,
  fps: number,
  sceneDuration: number,
  localFrame: number,
  sourceIndex: number
): ResolvedParametricGraphNode => {
  const animations = normalizeNodeAnimations(node, fps, sceneDuration);
  return {
    ...resolveBaseNode(node, fps, sceneDuration, localFrame, sourceIndex),
    color:
      resolveAnimatedColorValue(
        node.color ?? DEFAULT_GRAPH_COLOR,
        animations.colors.color,
        localFrame
      ) ?? DEFAULT_GRAPH_COLOR,
    drawProgress: resolveAnimatedNumericValue(
      node.drawProgress ?? 1,
      animations.numbers.drawProgress,
      localFrame
    ),
    height: node.height,
    strokeWidth: resolveAnimatedNumericValue(
      node.strokeWidth ?? DEFAULT_STROKE_WIDTH,
      animations.numbers.strokeWidth,
      localFrame
    ),
    type: "parametricGraph",
    width: node.width,
  };
};

export const resolveVideoNode = (
  node: VideoNode,
  fps: number,
  sceneDuration: number,
  localFrame: number,
  sourceIndex: number,
  caches?: PreRenderCaches
): ResolvedVideoNode => {
  if (node.type === "group") {
    return resolveGroupNode(
      node,
      fps,
      sceneDuration,
      localFrame,
      sourceIndex,
      caches
    );
  }
  if (node.type === "center") {
    return resolveCenterNode(
      node,
      fps,
      sceneDuration,
      localFrame,
      sourceIndex,
      caches
    );
  }
  if (node.type === "stack") {
    return resolveStackNode(
      node,
      fps,
      sceneDuration,
      localFrame,
      sourceIndex,
      caches
    );
  }
  if (node.type === "align") {
    return resolveAlignNode(
      node,
      fps,
      sceneDuration,
      localFrame,
      sourceIndex,
      caches
    );
  }
  if (node.type === "rect") {
    return resolveRectNode(node, fps, sceneDuration, localFrame, sourceIndex);
  }
  if (node.type === "text") {
    return resolveTextNode(node, fps, sceneDuration, localFrame, sourceIndex);
  }
  if (node.type === "math") {
    return resolveMathNode(
      node,
      fps,
      sceneDuration,
      localFrame,
      sourceIndex,
      caches
    );
  }
  if (node.type === "functionGraph") {
    return resolveFunctionGraphNode(
      node,
      fps,
      sceneDuration,
      localFrame,
      sourceIndex
    );
  }
  if (node.type === "parametricGraph") {
    return resolveParametricGraphNode(
      node,
      fps,
      sceneDuration,
      localFrame,
      sourceIndex
    );
  }
  return resolveImageNode(node, fps, sceneDuration, localFrame, sourceIndex);
};

export const resolveSceneNodes = (
  scene: VideoScene,
  fps: number,
  localFrame: number,
  caches?: PreRenderCaches
): ResolvedVideoNode[] =>
  sortResolvedNodes(
    scene.nodes.map((node, i) =>
      resolveVideoNode(node, fps, scene.duration, localFrame, i, caches)
    )
  );

const resolveSceneBackground = (
  videoDescription: VideoDescription,
  scene: VideoScene
): VideoColor =>
  scene.background ?? videoDescription.background ?? DEFAULT_SCENE_BACKGROUND;

export const resolveFrame = (
  videoDescription: VideoDescription,
  absoluteFrame: number,
  caches?: PreRenderCaches
): ResolvedFrame => {
  const scene = getSceneForFrame(videoDescription, absoluteFrame);

  if (!scene) {
    return createEmptyResolvedFrame(videoDescription, absoluteFrame);
  }

  const localFrame = getSceneLocalFrame(scene, absoluteFrame);
  const layoutNodes = resolveLayout(
    scene.nodes,
    videoDescription.width,
    videoDescription.height,
    caches
  );

  return {
    absoluteFrame,
    background: resolveSceneBackground(videoDescription, scene),
    localFrame,
    nodes: resolveSceneNodes(
      { ...scene, nodes: layoutNodes },
      videoDescription.fps,
      localFrame,
      caches
    ),
    scene,
  };
};
