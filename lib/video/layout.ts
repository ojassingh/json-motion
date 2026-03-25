import type { VideoAnchor, VideoNode } from "@/lib/types/video";
import { resolveMathDimensions } from "@/lib/video/math";
import type { PreRenderCaches } from "@/lib/video/pre-render";

interface Dimensions {
  height: number;
  width: number;
}

const getStaticNodeDimensions = (
  node: VideoNode,
  caches?: PreRenderCaches
): Dimensions => {
  if (
    node.type === "rect" ||
    node.type === "image" ||
    node.type === "functionGraph" ||
    node.type === "parametricGraph"
  ) {
    return { height: node.height, width: node.width };
  }

  if (node.type === "math") {
    return resolveMathDimensions(node, caches?.mathImages);
  }

  if (node.type === "text") {
    return { height: 0, width: node.maxWidth ?? 0 };
  }

  if (node.type === "group") {
    let maxRight = 0;
    let maxBottom = 0;

    for (const child of node.children) {
      const dims = getStaticNodeDimensions(child, caches);
      const right = (child.x ?? 0) + dims.width;
      const bottom = (child.y ?? 0) + dims.height;
      maxRight = Math.max(maxRight, right);
      maxBottom = Math.max(maxBottom, bottom);
    }

    return { height: maxBottom, width: maxRight };
  }

  if (node.type === "stack") {
    const childDims = node.children.map((child) =>
      getStaticNodeDimensions(child, caches)
    );
    const gapTotal = node.gap * Math.max(0, childDims.length - 1);

    if (node.direction === "vertical") {
      return {
        height: childDims.reduce((sum, d) => sum + d.height, 0) + gapTotal,
        width: Math.max(0, ...childDims.map((d) => d.width)),
      };
    }

    return {
      height: Math.max(0, ...childDims.map((d) => d.height)),
      width: childDims.reduce((sum, d) => sum + d.width, 0) + gapTotal,
    };
  }

  if (node.type === "center") {
    if (node.width !== undefined && node.height !== undefined) {
      return { height: node.height, width: node.width };
    }

    const childDims = node.children.map((child) =>
      getStaticNodeDimensions(child, caches)
    );
    const first = childDims[0] ?? { height: 0, width: 0 };
    return {
      height: node.height ?? first.height,
      width: node.width ?? first.width,
    };
  }

  return { height: 0, width: 0 };
};

const applyOffset = <TNode extends VideoNode>(
  node: TNode,
  dx: number,
  dy: number
): TNode => ({
  ...node,
  x: (node.x ?? 0) + dx,
  y: (node.y ?? 0) + dy,
});

const resolveCenterChildren = (
  children: VideoNode[],
  containerWidth: number,
  containerHeight: number,
  caches?: PreRenderCaches
): VideoNode[] =>
  children.map((child) => {
    const dims = getStaticNodeDimensions(child, caches);
    return applyOffset(
      child,
      containerWidth / 2 - dims.width / 2,
      containerHeight / 2 - dims.height / 2
    );
  });

const resolveStackChildren = (
  children: VideoNode[],
  direction: "horizontal" | "vertical",
  gap: number,
  align: "center" | "end" | "start",
  caches?: PreRenderCaches
): VideoNode[] => {
  const childDimensions = children.map((child) =>
    getStaticNodeDimensions(child, caches)
  );

  const crossAxisSize =
    direction === "vertical"
      ? Math.max(0, ...childDimensions.map((d) => d.width))
      : Math.max(0, ...childDimensions.map((d) => d.height));

  let mainOffset = 0;

  return children.map((child, index) => {
    const dims = childDimensions[index] ?? { height: 0, width: 0 };
    const crossDim = direction === "vertical" ? dims.width : dims.height;

    let crossOffset = 0;
    if (align === "center") {
      crossOffset = (crossAxisSize - crossDim) / 2;
    } else if (align === "end") {
      crossOffset = crossAxisSize - crossDim;
    }

    const dx = direction === "vertical" ? crossOffset : mainOffset;
    const dy = direction === "vertical" ? mainOffset : crossOffset;

    const result = applyOffset(child, dx, dy);
    mainOffset += (direction === "vertical" ? dims.height : dims.width) + gap;

    return result;
  });
};

const anchorFactors: Record<VideoAnchor, { xFactor: number; yFactor: number }> =
  {
    "bottom-center": { xFactor: 0.5, yFactor: 1 },
    "bottom-left": { xFactor: 0, yFactor: 1 },
    "bottom-right": { xFactor: 1, yFactor: 1 },
    center: { xFactor: 0.5, yFactor: 0.5 },
    "center-left": { xFactor: 0, yFactor: 0.5 },
    "center-right": { xFactor: 1, yFactor: 0.5 },
    "top-center": { xFactor: 0.5, yFactor: 0 },
    "top-left": { xFactor: 0, yFactor: 0 },
    "top-right": { xFactor: 1, yFactor: 0 },
  };

const resolveAlignChildren = (
  children: VideoNode[],
  position: VideoAnchor,
  padding: number,
  containerWidth: number,
  containerHeight: number,
  caches?: PreRenderCaches
): VideoNode[] =>
  children.map((child) => {
    const dims = getStaticNodeDimensions(child, caches);
    const { xFactor, yFactor } = anchorFactors[position];

    const rawX = xFactor * containerWidth;
    const rawY = yFactor * containerHeight;

    let paddedX = rawX;
    if (xFactor === 0) {
      paddedX = rawX + padding;
    } else if (xFactor === 1) {
      paddedX = rawX - padding;
    }

    let paddedY = rawY;
    if (yFactor === 0) {
      paddedY = rawY + padding;
    } else if (yFactor === 1) {
      paddedY = rawY - padding;
    }

    return applyOffset(
      child,
      paddedX - xFactor * dims.width,
      paddedY - yFactor * dims.height
    );
  });

const resolveNodeLayout = (
  node: VideoNode,
  containerWidth: number,
  containerHeight: number,
  caches?: PreRenderCaches
): VideoNode => {
  if (node.type === "center") {
    const width = node.width ?? containerWidth;
    const height = node.height ?? containerHeight;
    const resolved = resolveCenterChildren(
      node.children,
      width,
      height,
      caches
    );
    return {
      ...node,
      children: resolved.map((child) =>
        resolveNodeLayout(child, width, height, caches)
      ),
    };
  }

  if (node.type === "stack") {
    const resolved = resolveStackChildren(
      node.children,
      node.direction,
      node.gap,
      node.align ?? "center",
      caches
    );
    return {
      ...node,
      children: resolved.map((child) =>
        resolveNodeLayout(child, containerWidth, containerHeight, caches)
      ),
    };
  }

  if (node.type === "align") {
    const resolved = resolveAlignChildren(
      node.children,
      node.position,
      node.padding ?? 0,
      containerWidth,
      containerHeight,
      caches
    );
    return {
      ...node,
      children: resolved.map((child) =>
        resolveNodeLayout(child, containerWidth, containerHeight, caches)
      ),
    };
  }

  if (node.type === "group") {
    return {
      ...node,
      children: node.children.map((child) =>
        resolveNodeLayout(child, containerWidth, containerHeight, caches)
      ),
    };
  }

  return node;
};

export const resolveLayout = (
  nodes: VideoNode[],
  frameWidth: number,
  frameHeight: number,
  caches?: PreRenderCaches
): VideoNode[] =>
  nodes.map((node) => resolveNodeLayout(node, frameWidth, frameHeight, caches));
