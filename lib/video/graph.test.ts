import { describe, expect, test } from "bun:test";

import { convertAiOutputToVideoDescription } from "@/lib/actions/ai";
import { AppError } from "@/lib/errors";
import { sampleFunctionGraph, sampleParametricGraph } from "@/lib/video/graph";

describe("graph precomputation", () => {
  test("sampleFunctionGraph maps the identity function into pixel space", () => {
    const points = sampleFunctionGraph({
      fn: "x",
      height: 100,
      type: "functionGraph",
      width: 100,
      xRange: [0, 1],
      yRange: [0, 1],
    });

    expect(points).toHaveLength(100);
    expect(points[0]).toEqual({ x: 0, y: 100 });
    expect(points.at(-1)).toEqual({ x: 100, y: 0 });
  });

  test("sampleFunctionGraph skips non-finite samples and leaves a gap", () => {
    const points = sampleFunctionGraph({
      fn: "1 / x",
      height: 100,
      type: "functionGraph",
      width: 101,
      xRange: [-1, 1],
      yRange: [-10, 10],
    });

    expect(points.length).toBeLessThan(101);
    expect(points.some((point) => Math.abs(point.x - 50) < 1e-6)).toBeFalse();
  });

  test("sampleFunctionGraph throws PRERENDER_ERROR for invalid expressions", () => {
    try {
      sampleFunctionGraph({
        fn: "sin(",
        height: 100,
        type: "functionGraph",
        width: 100,
        xRange: [0, 1],
        yRange: [0, 1],
      });
      throw new Error("expected sampleFunctionGraph to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("PRERENDER_ERROR");
      expect((error as AppError).message).toContain('graph expression "sin("');
    }
  });

  test("sampleParametricGraph centers and scales a circle", () => {
    const points = sampleParametricGraph({
      fnX: "cos(t)",
      fnY: "sin(t)",
      height: 200,
      samples: 500,
      tRange: [0, Math.PI * 2],
      type: "parametricGraph",
      width: 200,
    });

    expect(points).toHaveLength(500);

    const center = points.reduce(
      (acc, point) => ({
        x: acc.x + point.x / points.length,
        y: acc.y + point.y / points.length,
      }),
      { x: 0, y: 0 }
    );
    const averageRadius = points.reduce((sum, point) => {
      return (
        sum + Math.hypot(point.x - center.x, point.y - center.y) / points.length
      );
    }, 0);

    expect(center.x).toBeCloseTo(100, 0);
    expect(center.y).toBeCloseTo(100, 0);
    expect(averageRadius).toBeCloseTo(100, 0);
  });

  test("convertAiOutputToVideoDescription injects graph points before validation", async () => {
    const description = await convertAiOutputToVideoDescription({
      scenes: [
        {
          duration: 1,
          id: "scene-1",
          nodes: {
            curve: {
              fn: "sin(x)",
              height: 180,
              showAxes: true,
              type: "functionGraph",
              width: 240,
              xRange: [-Math.PI, Math.PI],
              yRange: [-1.5, 1.5],
            },
          },
        },
      ],
    });

    const scene = description.scenes[0];
    if (!scene) {
      throw new Error("expected a scene");
    }

    const curve = scene.nodes.curve;
    if (!curve || curve.type !== "functionGraph") {
      throw new Error("expected a functionGraph node");
    }

    expect(curve.points).toHaveLength(240);
    expect(curve.showAxes).toBeTrue();
  });
});
