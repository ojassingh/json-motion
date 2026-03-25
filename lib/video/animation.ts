import type {
  ResolvedFrame,
  ResolvedFunctionGraphNode,
  ResolvedGroupNode,
  ResolvedImageNode,
  ResolvedMathNode,
  ResolvedParametricGraphNode,
  ResolvedRectNode,
  ResolvedTextNode,
  ResolvedVideoNode,
  VideoColor,
  VideoColorAnimationStep,
  VideoColorAnimationValue,
  VideoDescription,
  VideoEasingName,
  VideoFunctionGraphNode,
  VideoGroupNode,
  VideoImageNode,
  VideoMathNode,
  VideoNode,
  VideoNumericAnimationStep,
  VideoNumericAnimationValue,
  VideoParametricGraphNode,
  VideoRectNode,
  VideoScene,
  VideoTextNode,
  VideoTimeValue,
} from "@/lib/types/video";
import { lerpOklch } from "@/lib/video/color";
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

type ColorAnimationProperty = "background" | "color" | "fill" | "stroke";
type NumericAnimationProperty =
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
    const overshoot = 1.701_58;

    return (overshoot + 1) * progress ** 3 - overshoot * progress ** 2;
  }

  if (easing === "ease-out-back") {
    const overshoot = 1.701_58;
    const invertedProgress = progress - 1;

    return (
      1 +
      (overshoot + 1) * invertedProgress ** 3 +
      overshoot * invertedProgress ** 2
    );
  }

  if (easing === "spring") {
    return 1 - Math.exp(-6 * progress) * Math.cos(progress * 10);
  }

  return progress;
};

const interpolate = (from: number, to: number, progress: number): number =>
  from + (to - from) * progress;

const toAnimationSteps = <
  TStep extends VideoColorAnimationStep | VideoNumericAnimationStep,
>(
  value: TStep | TStep[] | undefined
): TStep[] => {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
};

export const toFrameTime = (value: VideoTimeValue, fps: number): number =>
  typeof value === "string"
    ? Math.round(Number.parseFloat(value.slice(0, -1)) * fps)
    : value;

export const normalizeNumericAnimationValue = (
  value: VideoNumericAnimationValue | undefined,
  fps: number
): NormalizedAnimationSegment<number>[] =>
  toAnimationSteps(value).map((step) => ({
    easing: step.easing ?? "ease-out",
    endFrame: toFrameTime(step.end, fps),
    from: step.from,
    startFrame: toFrameTime(step.start ?? 0, fps),
    to: step.to,
  }));

export const normalizeColorAnimationValue = (
  value: VideoColorAnimationValue | undefined,
  fps: number
): NormalizedAnimationSegment<VideoColor>[] =>
  toAnimationSteps(value).map((step) => ({
    easing: step.easing ?? "ease-out",
    endFrame: toFrameTime(step.end, fps),
    from: step.from,
    startFrame: toFrameTime(step.start ?? 0, fps),
    to: step.to,
  }));

const appendNumericSegments = (
  target: NormalizedNodeAnimations["numbers"],
  property: NumericAnimationProperty,
  segments: NormalizedAnimationSegment<number>[]
): void => {
  const existingSegments = target[property] ?? [];
  target[property] = [...existingSegments, ...segments];
};

const getBaseNodeValues = (node: VideoNode) => {
  const uniformScale = node.scale ?? 1;

  return {
    anchor: node.anchor ?? "center",
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

  return {
    ...segment,
    endFrame,
    startFrame,
  };
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
    {
      easing,
      endFrame,
      from,
      startFrame,
      to,
    },
    sceneDuration
  );

const filterValidSegments = (
  segments: Array<NormalizedAnimationSegment<number> | null>
): NormalizedAnimationSegment<number>[] =>
  segments.filter(
    (segment): segment is NormalizedAnimationSegment<number> => segment !== null
  );

const getPopScaleSegments = (
  baseScale: number,
  sceneDuration: number
): NormalizedAnimationSegment<number>[] => {
  const midpoint = Math.max(Math.floor(DEFAULT_POP_DURATION / 2) - 1, 0);

  return filterValidSegments([
    createPrimitiveSegment(
      baseScale,
      baseScale * 1.08,
      0,
      midpoint,
      sceneDuration,
      "ease-out-back"
    ),
    createPrimitiveSegment(
      baseScale * 1.08,
      baseScale,
      midpoint + 1,
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
  const animations: NormalizedNodeAnimations = {
    colors: {},
    numbers: {},
  };
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

const getCommonExplicitAnimations = (
  node: VideoNode,
  fps: number
): NormalizedNodeAnimations["numbers"] => {
  const animations: NormalizedNodeAnimations["numbers"] = {};
  const animate = node.animate;

  if (!animate) {
    return animations;
  }

  if (animate.opacity) {
    animations.opacity = normalizeNumericAnimationValue(animate.opacity, fps);
  }

  if (animate.rotate) {
    animations.rotation = normalizeNumericAnimationValue(animate.rotate, fps);
  }

  if (animate.skewX) {
    animations.skewX = normalizeNumericAnimationValue(animate.skewX, fps);
  }

  if (animate.skewY) {
    animations.skewY = normalizeNumericAnimationValue(animate.skewY, fps);
  }

  if (animate.x) {
    animations.x = normalizeNumericAnimationValue(animate.x, fps);
  }

  if (animate.y) {
    animations.y = normalizeNumericAnimationValue(animate.y, fps);
  }

  if (animate.scale) {
    const scaleAnimations = normalizeNumericAnimationValue(animate.scale, fps);

    if (!animate.scaleX) {
      animations.scaleX = scaleAnimations;
    }

    if (!animate.scaleY) {
      animations.scaleY = scaleAnimations;
    }
  }

  if (animate.scaleX) {
    animations.scaleX = normalizeNumericAnimationValue(animate.scaleX, fps);
  }

  if (animate.scaleY) {
    animations.scaleY = normalizeNumericAnimationValue(animate.scaleY, fps);
  }

  return animations;
};

const getRectExplicitAnimations = (
  node: VideoRectNode,
  fps: number
): NormalizedNodeAnimations => ({
  colors: {
    ...(node.animate?.fill
      ? {
          fill: normalizeColorAnimationValue(node.animate.fill, fps),
        }
      : {}),
    ...(node.animate?.stroke
      ? {
          stroke: normalizeColorAnimationValue(node.animate.stroke, fps),
        }
      : {}),
  },
  numbers: {
    ...(node.animate?.cornerRadius
      ? {
          radius: normalizeNumericAnimationValue(
            node.animate.cornerRadius,
            fps
          ),
        }
      : {}),
    ...(node.animate?.height
      ? {
          height: normalizeNumericAnimationValue(node.animate.height, fps),
        }
      : {}),
    ...(node.animate?.strokeWidth
      ? {
          strokeWidth: normalizeNumericAnimationValue(
            node.animate.strokeWidth,
            fps
          ),
        }
      : {}),
    ...(node.animate?.width
      ? {
          width: normalizeNumericAnimationValue(node.animate.width, fps),
        }
      : {}),
  },
});

const getTextExplicitAnimations = (
  node: VideoTextNode,
  fps: number
): NormalizedNodeAnimations => ({
  colors: {
    ...(node.animate?.color
      ? {
          color: normalizeColorAnimationValue(node.animate.color, fps),
        }
      : {}),
  },
  numbers: {
    ...(node.animate?.size
      ? {
          fontSize: normalizeNumericAnimationValue(node.animate.size, fps),
        }
      : {}),
  },
});

const getImageExplicitAnimations = (
  node: VideoImageNode,
  fps: number
): NormalizedNodeAnimations => ({
  colors: {},
  numbers: {
    ...(node.animate?.height
      ? {
          height: normalizeNumericAnimationValue(node.animate.height, fps),
        }
      : {}),
    ...(node.animate?.width
      ? {
          width: normalizeNumericAnimationValue(node.animate.width, fps),
        }
      : {}),
  },
});

const getMathExplicitAnimations = (
  _node: VideoMathNode,
  _fps: number
): NormalizedNodeAnimations => ({ colors: {}, numbers: {} });

const getFunctionGraphExplicitAnimations = (
  node: VideoFunctionGraphNode,
  fps: number
): NormalizedNodeAnimations => ({
  colors: {
    ...(node.animate?.color
      ? { color: normalizeColorAnimationValue(node.animate.color, fps) }
      : {}),
  },
  numbers: {
    ...(node.animate?.drawProgress
      ? {
          drawProgress: normalizeNumericAnimationValue(
            node.animate.drawProgress,
            fps
          ),
        }
      : {}),
    ...(node.animate?.strokeWidth
      ? {
          strokeWidth: normalizeNumericAnimationValue(
            node.animate.strokeWidth,
            fps
          ),
        }
      : {}),
  },
});

const getParametricGraphExplicitAnimations = (
  node: VideoParametricGraphNode,
  fps: number
): NormalizedNodeAnimations => ({
  colors: {
    ...(node.animate?.color
      ? { color: normalizeColorAnimationValue(node.animate.color, fps) }
      : {}),
  },
  numbers: {
    ...(node.animate?.drawProgress
      ? {
          drawProgress: normalizeNumericAnimationValue(
            node.animate.drawProgress,
            fps
          ),
        }
      : {}),
    ...(node.animate?.strokeWidth
      ? {
          strokeWidth: normalizeNumericAnimationValue(
            node.animate.strokeWidth,
            fps
          ),
        }
      : {}),
  },
});

const mergeAnimations = (
  primitiveAnimations: NormalizedNodeAnimations,
  explicitAnimations: NormalizedNodeAnimations
): NormalizedNodeAnimations => ({
  colors: {
    ...primitiveAnimations.colors,
    ...explicitAnimations.colors,
  },
  numbers: {
    ...primitiveAnimations.numbers,
    ...explicitAnimations.numbers,
  },
});

export const normalizeNodeAnimations = (
  node: VideoNode,
  fps: number,
  sceneDuration: number
): NormalizedNodeAnimations => {
  const primitiveAnimations = getPrimitiveAnimations(node, sceneDuration);
  const commonAnimations: NormalizedNodeAnimations = {
    colors: {},
    numbers: getCommonExplicitAnimations(node, fps),
  };
  let typeSpecificAnimations: NormalizedNodeAnimations = {
    colors: {},
    numbers: {},
  };

  if (node.type === "rect") {
    typeSpecificAnimations = getRectExplicitAnimations(node, fps);
  } else if (node.type === "text") {
    typeSpecificAnimations = getTextExplicitAnimations(node, fps);
  } else if (node.type === "image") {
    typeSpecificAnimations = getImageExplicitAnimations(node, fps);
  } else if (node.type === "math") {
    typeSpecificAnimations = getMathExplicitAnimations(node, fps);
  } else if (node.type === "functionGraph") {
    typeSpecificAnimations = getFunctionGraphExplicitAnimations(node, fps);
  } else if (node.type === "parametricGraph") {
    typeSpecificAnimations = getParametricGraphExplicitAnimations(node, fps);
  }

  return mergeAnimations(
    primitiveAnimations,
    mergeAnimations(commonAnimations, typeSpecificAnimations)
  );
};

export const normalizeSceneBackgroundAnimations = (
  scene: VideoScene,
  fps: number
): NormalizedAnimationSegment<VideoColor>[] =>
  typeof scene.background === "string"
    ? []
    : normalizeColorAnimationValue(scene.background, fps);

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

const sortResolvedNodes = (nodes: ResolvedVideoNode[]): ResolvedVideoNode[] =>
  nodes.toSorted((leftNode, rightNode) => {
    const zIndexDifference = leftNode.zIndex - rightNode.zIndex;

    if (zIndexDifference !== 0) {
      return zIndexDifference;
    }

    return leftNode.sourceIndex - rightNode.sourceIndex;
  });

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

const resolveGroupNode = (
  node: VideoGroupNode,
  fps: number,
  sceneDuration: number,
  localFrame: number,
  sourceIndex: number
): ResolvedGroupNode => ({
  ...resolveBaseNode(node, fps, sceneDuration, localFrame, sourceIndex),
  children: sortResolvedNodes(
    node.children.map((childNode: VideoNode, childIndex: number) =>
      resolveVideoNode(childNode, fps, sceneDuration, localFrame, childIndex)
    )
  ),
  type: "group",
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
  sourceIndex: number
): ResolvedMathNode => {
  const animations = normalizeNodeAnimations(node, fps, sceneDuration);

  return {
    ...resolveBaseNode(node, fps, sceneDuration, localFrame, sourceIndex),
    color:
      resolveAnimatedColorValue(
        node.color ?? DEFAULT_MATH_COLOR,
        animations.colors.color,
        localFrame
      ) ?? DEFAULT_MATH_COLOR,
    fontSize: node.fontSize,
    height: node.height,
    latex: node.latex,
    type: "math",
    width: node.width,
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
  sourceIndex: number
): ResolvedVideoNode => {
  if (node.type === "group") {
    return resolveGroupNode(node, fps, sceneDuration, localFrame, sourceIndex);
  }

  if (node.type === "rect") {
    return resolveRectNode(node, fps, sceneDuration, localFrame, sourceIndex);
  }

  if (node.type === "text") {
    return resolveTextNode(node, fps, sceneDuration, localFrame, sourceIndex);
  }

  if (node.type === "math") {
    return resolveMathNode(node, fps, sceneDuration, localFrame, sourceIndex);
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
  localFrame: number
): ResolvedVideoNode[] =>
  sortResolvedNodes(
    scene.nodes.map((node, sourceIndex) =>
      resolveVideoNode(node, fps, scene.duration, localFrame, sourceIndex)
    )
  );

const resolveSceneBackground = (
  videoDescription: VideoDescription,
  scene: VideoScene,
  localFrame: number
): VideoColor =>
  resolveAnimatedColorValue(
    typeof scene.background === "string"
      ? scene.background
      : (videoDescription.background ?? DEFAULT_SCENE_BACKGROUND),
    normalizeSceneBackgroundAnimations(scene, videoDescription.fps),
    localFrame
  ) ??
  videoDescription.background ??
  DEFAULT_SCENE_BACKGROUND;

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
    background: resolveSceneBackground(videoDescription, scene, localFrame),
    localFrame,
    nodes: resolveSceneNodes(scene, videoDescription.fps, localFrame),
    scene,
  };
};
