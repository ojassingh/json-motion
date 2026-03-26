import type { VideoAnchor, VideoNode } from "@/lib/types/video";
import {
  DEFAULT_TEXT_FONT_SIZE,
  DEFAULT_TEXT_LINE_HEIGHT_MULTIPLIER,
} from "@/lib/video/config";
import { resolveMathDimensions } from "@/lib/video/math";
import type { PreRenderCaches } from "@/lib/video/pre-render";

interface Dimensions {
  height: number;
  width: number;
}

interface Position {
  x: number;
  y: number;
}

const ANCHOR_FACTORS: Record<VideoAnchor, Position> = {
  "bottom-center": { x: 0.5, y: 1 },
  "bottom-left": { x: 0, y: 1 },
  "bottom-right": { x: 1, y: 1 },
  center: { x: 0.5, y: 0.5 },
  "center-left": { x: 0, y: 0.5 },
  "center-right": { x: 1, y: 0.5 },
  "top-center": { x: 0.5, y: 0 },
  "top-left": { x: 0, y: 0 },
  "top-right": { x: 1, y: 0 },
};

export const getNodeDimensions = (
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
    const lineCount = node.text.split("\n").length;
    const lineHeight =
      node.lineHeight ??
      (node.size ?? DEFAULT_TEXT_FONT_SIZE) *
        DEFAULT_TEXT_LINE_HEIGHT_MULTIPLIER;
    return { height: lineCount * lineHeight, width: node.maxWidth ?? 0 };
  }

  return { height: 0, width: 0 };
};

const alignCross = (
  parentStart: number,
  parentSize: number,
  childSize: number,
  align: string
): number => {
  if (align === "start") {
    return parentStart;
  }
  if (align === "end") {
    return parentStart + parentSize - childSize;
  }
  return parentStart + (parentSize - childSize) / 2;
};

/**
 * Kahn's algorithm — returns node IDs in dependency order.
 */
const topoSort = (
  ids: string[],
  nodes: Record<string, VideoNode>
): string[] => {
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const id of ids) {
    inDegree.set(id, 0);
  }
  for (const [id, node] of Object.entries(nodes)) {
    if (node.anchorTo && nodes[node.anchorTo]) {
      inDegree.set(id, 1);
      const list = dependents.get(node.anchorTo) ?? [];
      list.push(id);
      dependents.set(node.anchorTo, list);
    }
  }

  const queue = ids.filter((id) => (inDegree.get(id) ?? 0) === 0);
  const sorted: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) {
      break;
    }
    sorted.push(id);
    for (const dep of dependents.get(id) ?? []) {
      const next = (inDegree.get(dep) ?? 1) - 1;
      inDegree.set(dep, next);
      if (next === 0) {
        queue.push(dep);
      }
    }
  }

  return sorted;
};

const resolveAnchoredPosition = (
  node: VideoNode,
  dims: Dimensions,
  parentPos: Position,
  parentDims: Dimensions
): Position => {
  const edge = node.anchorEdge ?? "bottom";
  const align = node.anchorAlign ?? "center";
  const gap = node.gap ?? 0;

  if (edge === "bottom") {
    return {
      x: alignCross(parentPos.x, parentDims.width, dims.width, align),
      y: parentPos.y + parentDims.height + gap,
    };
  }
  if (edge === "top") {
    return {
      x: alignCross(parentPos.x, parentDims.width, dims.width, align),
      y: parentPos.y - dims.height - gap,
    };
  }
  if (edge === "right") {
    return {
      x: parentPos.x + parentDims.width + gap,
      y: alignCross(parentPos.y, parentDims.height, dims.height, align),
    };
  }
  return {
    x: parentPos.x - dims.width - gap,
    y: alignCross(parentPos.y, parentDims.height, dims.height, align),
  };
};

const resolvePlacePosition = (
  place: VideoAnchor,
  dims: Dimensions,
  frameWidth: number,
  frameHeight: number
): Position => {
  const f = ANCHOR_FACTORS[place];
  return {
    x: frameWidth * f.x - dims.width * f.x,
    y: frameHeight * f.y - dims.height * f.y,
  };
};

/**
 * Topological sort of the node dependency graph,
 * then resolve each node's top-left (x, y) position based on
 * `place`, `anchorTo`, or explicit `x`/`y`.
 */
export const resolveLayout = (
  nodes: Record<string, VideoNode>,
  frameWidth: number,
  frameHeight: number,
  caches?: PreRenderCaches
): Map<string, Position> => {
  const positions = new Map<string, Position>();
  const sorted = topoSort(Object.keys(nodes), nodes);

  for (const id of sorted) {
    const node = nodes[id];
    if (!node) {
      continue;
    }

    const dims = getNodeDimensions(node, caches);
    const anchorTarget = node.anchorTo;

    if (anchorTarget && positions.has(anchorTarget) && nodes[anchorTarget]) {
      const parentPos = positions.get(anchorTarget) ?? { x: 0, y: 0 };
      const parentDims = getNodeDimensions(nodes[anchorTarget], caches);
      positions.set(
        id,
        resolveAnchoredPosition(node, dims, parentPos, parentDims)
      );
    } else if (node.place) {
      positions.set(
        id,
        resolvePlacePosition(node.place, dims, frameWidth, frameHeight)
      );
    } else {
      positions.set(id, { x: node.x ?? 0, y: node.y ?? 0 });
    }
  }

  return positions;
};
