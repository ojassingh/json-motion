import { compile } from "mathjs";

import { toAppError } from "@/lib/errors";
import type {
  VideoFunctionGraphNode,
  VideoParametricGraphNode,
  VideoScene,
} from "@/lib/types/video";

export interface Point2D {
  x: number;
  y: number;
}

const collectGraphNodes = (
  scenes: VideoScene[]
): {
  functionGraphNodes: VideoFunctionGraphNode[];
  parametricGraphNodes: VideoParametricGraphNode[];
} => {
  const functionGraphNodes: VideoFunctionGraphNode[] = [];
  const parametricGraphNodes: VideoParametricGraphNode[] = [];

  for (const scene of scenes) {
    const stack = [...scene.nodes];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) {
        continue;
      }
      if (node.type === "functionGraph") {
        functionGraphNodes.push(node);
      } else if (node.type === "parametricGraph") {
        parametricGraphNodes.push(node);
      } else if (node.type === "group") {
        stack.push(...node.children);
      }
    }
  }

  return { functionGraphNodes, parametricGraphNodes };
};

const sampleFunctionGraph = (node: VideoFunctionGraphNode): Point2D[] => {
  const expr = compile(node.fn);
  const xMin = node.xRange[0] ?? 0;
  const xMax = node.xRange[1] ?? 1;
  const yMin = node.yRange[0] ?? -1;
  const yMax = node.yRange[1] ?? 1;
  const count = Math.max(Math.round(node.width), 2);
  const points: Point2D[] = [];

  for (let i = 0; i < count; i++) {
    const x = xMin + (i / (count - 1)) * (xMax - xMin);
    const rawY = expr.evaluate({ x });

    if (typeof rawY !== "number" || !Number.isFinite(rawY)) {
      continue;
    }

    const clampedY = Math.max(yMin, Math.min(yMax, rawY));
    const px = ((x - xMin) / (xMax - xMin)) * node.width;
    const py = (1 - (clampedY - yMin) / (yMax - yMin)) * node.height;
    points.push({ x: px, y: py });
  }

  return points;
};

const sampleParametricGraph = (node: VideoParametricGraphNode): Point2D[] => {
  const exprX = compile(node.fnX);
  const exprY = compile(node.fnY);
  const tMin = node.tRange[0] ?? 0;
  const tMax = node.tRange[1] ?? 1;
  const count = node.samples ?? 500;
  const rawPoints: Point2D[] = [];

  for (let i = 0; i < count; i++) {
    const t = tMin + (i / (count - 1)) * (tMax - tMin);
    const rawX = exprX.evaluate({ t });
    const rawY = exprY.evaluate({ t });

    if (
      typeof rawX !== "number" ||
      !Number.isFinite(rawX) ||
      typeof rawY !== "number" ||
      !Number.isFinite(rawY)
    ) {
      continue;
    }

    rawPoints.push({ x: rawX, y: rawY });
  }

  if (rawPoints.length === 0) {
    return [];
  }

  const xs = rawPoints.map((p) => p.x);
  const ys = rawPoints.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  return rawPoints.map(({ x, y }) => ({
    x: ((x - minX) / rangeX) * node.width,
    y: (1 - (y - minY) / rangeY) * node.height,
  }));
};

export const preSampleGraphNodes = (
  scenes: VideoScene[]
): Map<string, Point2D[]> => {
  const { functionGraphNodes, parametricGraphNodes } =
    collectGraphNodes(scenes);
  const cache = new Map<string, Point2D[]>();

  for (const node of functionGraphNodes) {
    try {
      cache.set(node.id, sampleFunctionGraph(node));
    } catch (error) {
      throw toAppError(error, "PRERENDER_ERROR", {
        message: `Failed to sample function graph "${node.fn}"`,
      });
    }
  }

  for (const node of parametricGraphNodes) {
    try {
      cache.set(node.id, sampleParametricGraph(node));
    } catch (error) {
      throw toAppError(error, "PRERENDER_ERROR", {
        message: `Failed to sample parametric graph fnX="${node.fnX}" fnY="${node.fnY}"`,
      });
    }
  }

  return cache;
};
