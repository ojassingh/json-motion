import { compile } from "mathjs";

import { AppError } from "@/lib/errors";
import type {
  VideoAiFunctionGraphNode,
  VideoAiParametricGraphNode,
  VideoFunctionGraphNode,
  VideoParametricGraphNode,
  VideoPoint,
  VideoPrerenderScene,
  VideoScene,
} from "@/lib/types/video";

const DEFAULT_PARAMETRIC_SAMPLES = 500;

interface CompiledExpression {
  evaluate(scope: Record<string, number>): unknown;
}

interface RawPoint {
  x: number;
  y: number;
}

const createPrerenderError = (expression: string, error: unknown): AppError =>
  new AppError("PRERENDER_ERROR", {
    details:
      error instanceof Error && error.message.trim().length > 0
        ? [error.message]
        : [],
    message: `Failed to pre-render graph expression "${expression}".`,
  });

const compileExpression = (expression: string): CompiledExpression => {
  try {
    return compile(expression) as unknown as CompiledExpression;
  } catch (error) {
    throw createPrerenderError(expression, error);
  }
};

const evaluateExpression = (
  compiled: CompiledExpression,
  scope: Record<string, number>,
  expression: string
): number | null => {
  try {
    const rawValue = compiled.evaluate(scope);
    const numericValue =
      typeof rawValue === "number" ? rawValue : Number(rawValue);
    return Number.isFinite(numericValue) ? numericValue : null;
  } catch (error) {
    throw createPrerenderError(expression, error);
  }
};

const getEvenlySpacedValue = (
  index: number,
  total: number,
  min: number,
  max: number
): number => {
  if (total <= 1) {
    return min;
  }
  return min + ((max - min) * index) / (total - 1);
};

const validateNonDegenerateRange = (
  expression: string,
  label: string,
  [min, max]: [number, number]
): void => {
  if (min === max) {
    throw new AppError("PRERENDER_ERROR", {
      message: `Failed to pre-render graph expression "${expression}" because ${label} cannot have identical bounds.`,
    });
  }
};

export const sampleFunctionGraph = (
  node: VideoAiFunctionGraphNode | VideoFunctionGraphNode
): VideoPoint[] => {
  validateNonDegenerateRange(node.fn, "xRange", node.xRange);
  validateNonDegenerateRange(node.fn, "yRange", node.yRange);

  const compiled = compileExpression(node.fn);
  const [xMin, xMax] = node.xRange;
  const [yMin, yMax] = node.yRange;
  const sampleCount = Math.max(2, Math.round(node.width));
  const points: VideoPoint[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const x = getEvenlySpacedValue(index, sampleCount, xMin, xMax);
    const y = evaluateExpression(compiled, { x }, node.fn);

    if (y == null) {
      continue;
    }

    points.push({
      x: ((x - xMin) / (xMax - xMin)) * node.width,
      y: node.height - ((y - yMin) / (yMax - yMin)) * node.height,
    });
  }

  return points;
};

const getScaleToFit = (
  width: number,
  height: number,
  rawWidth: number,
  rawHeight: number
): number => {
  if (rawWidth === 0 && rawHeight === 0) {
    return 1;
  }
  if (rawWidth === 0) {
    return height / rawHeight;
  }
  if (rawHeight === 0) {
    return width / rawWidth;
  }
  return Math.min(width / rawWidth, height / rawHeight);
};

export const sampleParametricGraph = (
  node: VideoAiParametricGraphNode | VideoParametricGraphNode
): VideoPoint[] => {
  validateNonDegenerateRange(`${node.fnX}; ${node.fnY}`, "tRange", node.tRange);

  const compiledX = compileExpression(node.fnX);
  const compiledY = compileExpression(node.fnY);
  const [tMin, tMax] = node.tRange;
  const sampleCount = Math.max(2, node.samples ?? DEFAULT_PARAMETRIC_SAMPLES);
  const rawPoints: RawPoint[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const t = getEvenlySpacedValue(index, sampleCount, tMin, tMax);
    const x = evaluateExpression(compiledX, { t }, node.fnX);
    const y = evaluateExpression(compiledY, { t }, node.fnY);

    if (x == null || y == null) {
      continue;
    }

    rawPoints.push({ x, y });
  }

  if (rawPoints.length === 0) {
    return [];
  }

  const xValues = rawPoints.map((point) => point.x);
  const yValues = rawPoints.map((point) => point.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const scale = getScaleToFit(
    node.width,
    node.height,
    maxX - minX,
    maxY - minY
  );

  return rawPoints.map((point) => ({
    x: node.width / 2 + (point.x - centerX) * scale,
    y: node.height / 2 - (point.y - centerY) * scale,
  }));
};

export const preComputeGraphNodes = (
  scenes: VideoPrerenderScene[]
): VideoScene[] =>
  scenes.map((scene) => ({
    ...scene,
    nodes: Object.fromEntries(
      Object.entries(scene.nodes).map(([id, node]) => {
        if (node.type === "functionGraph") {
          return [
            id,
            {
              ...node,
              points: sampleFunctionGraph(node),
            } satisfies VideoFunctionGraphNode,
          ];
        }

        if (node.type === "parametricGraph") {
          return [
            id,
            {
              ...node,
              points: sampleParametricGraph(node),
            } satisfies VideoParametricGraphNode,
          ];
        }

        return [id, node];
      })
    ),
  }));
