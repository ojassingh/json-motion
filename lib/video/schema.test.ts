import { describe, expect, test } from "bun:test";

import { videoDescriptionSchema } from "@/lib/video/schema";

const baseDescription = {
  background: "#000000",
  fps: 60,
  height: 180,
  scenes: [
    {
      duration: 30,
      id: "scene-1",
      nodes: {},
      startFrame: 0,
      timeline: [],
    },
  ],
  width: 320,
};

describe("videoDescriptionSchema", () => {
  test("rejects unsupported image nodes", () => {
    const result = videoDescriptionSchema.safeParse({
      ...baseDescription,
      scenes: [
        {
          ...baseDescription.scenes[0],
          nodes: {
            image: {
              height: 80,
              src: "https://example.com/image.png",
              type: "image",
              width: 120,
            },
          },
        },
      ],
    });

    expect(result.success).toBeFalse();
    if (result.success) {
      throw new Error("expected schema failure");
    }
    expect(result.error.issues.length).toBeGreaterThan(0);
  });

  test("accepts circle and absolute line nodes", () => {
    const result = videoDescriptionSchema.safeParse({
      ...baseDescription,
      scenes: [
        {
          ...baseDescription.scenes[0],
          nodes: {
            connector: {
              cap: "round",
              drawProgress: 0.5,
              stroke: "#f8fafc",
              strokeWidth: 3,
              type: "line",
              x1: 0,
              x2: 120,
              y1: 0,
              y2: 0,
            },
            neuron: {
              drawProgress: 1,
              fill: "#38bdf8",
              radius: 24,
              stroke: "#f8fafc",
              strokeWidth: 2,
              type: "circle",
              x: 80,
              y: 40,
            },
          },
        },
      ],
    });

    expect(result.success).toBeTrue();
  });

  test("accepts endpoint-based lines with arrowheads", () => {
    const result = videoDescriptionSchema.safeParse({
      ...baseDescription,
      scenes: [
        {
          ...baseDescription.scenes[0],
          nodes: {
            box: {
              fill: "#38bdf8",
              height: 48,
              type: "rect",
              width: 96,
              x: 112,
              y: 84,
            },
            connector: {
              from: { anchor: "bottom-center", node: "label" },
              head: "end",
              headSize: 10,
              stroke: "#f8fafc",
              strokeWidth: 4,
              to: { anchor: "top-center", node: "box" },
              type: "line",
            },
            label: {
              size: 24,
              text: "Input",
              type: "text",
              x: 120,
              y: 24,
            },
          },
        },
      ],
    });

    expect(result.success).toBeTrue();
  });
});
