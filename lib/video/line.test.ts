import { describe, expect, test } from "bun:test";

import { convertAiOutputToVideoDescription } from "@/lib/actions/ai";
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

describe("video lines", () => {
  test("accepts a line that connects nodes with an end arrowhead", () => {
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
              y: 72,
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
              x: 128,
              y: 24,
            },
          },
        },
      ],
    });

    expect(result.success).toBeTrue();
  });

  test("rejects lines that mix absolute coordinates with explicit endpoints", () => {
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
              y: 60,
            },
            connector: {
              from: { x: 24, y: 24 },
              stroke: "#f8fafc",
              strokeWidth: 3,
              to: { anchor: "center-left", node: "box" },
              type: "line",
              x1: 0,
              x2: 96,
              y1: 0,
              y2: 48,
            },
          },
        },
      ],
    });

    expect(result.success).toBeFalse();
    if (result.success) {
      throw new Error("expected schema failure");
    }
    expect(result.error.issues[0]?.message).toContain("cannot mix");
  });

  test("expands repeated lines and fans timeline targets out to copies", async () => {
    const description = await convertAiOutputToVideoDescription({
      scenes: [
        {
          duration: 1,
          id: "scene-1",
          nodes: {
            diagonal: {
              colStep: { x: 30 },
              cols: 2,
              rowStep: { x: 20, y: 10 },
              rows: 2,
              template: {
                head: "end",
                headSize: 8,
                stroke: "#f8fafc",
                strokeWidth: 3,
                type: "line",
                x1: 0,
                x2: 24,
                y1: 0,
                y2: 0,
              },
              type: "repeat",
            },
          },
          timeline: [
            {
              at: 0.25,
              dur: 0.2,
              opacity: 1,
              target: "diagonal",
            },
          ],
        },
      ],
    });

    const scene = description.scenes[0];
    if (!scene) {
      throw new Error("expected a scene");
    }

    expect(Object.keys(scene.nodes)).toEqual([
      "diagonal_r0_c0",
      "diagonal_r0_c1",
      "diagonal_r1_c0",
      "diagonal_r1_c1",
    ]);

    const repeatedLine = scene.nodes.diagonal_r1_c1;
    if (!repeatedLine || repeatedLine.type !== "line") {
      throw new Error("expected repeated line node");
    }
    expect(repeatedLine.head).toBe("end");
    expect(repeatedLine.x).toBe(50);
    expect(repeatedLine.y).toBe(10);

    const event = scene.timeline?.[0];
    expect(event?.target).toEqual([
      "diagonal_r0_c0",
      "diagonal_r0_c1",
      "diagonal_r1_c0",
      "diagonal_r1_c1",
    ]);
  });

  test("rejects repeat nodes used as layout children with a clear error", async () => {
    await expect(
      convertAiOutputToVideoDescription({
        scenes: [
          {
            duration: 1,
            id: "scene-1",
            nodes: {
              centered: {
                children: ["grid"],
                type: "center",
              },
              grid: {
                colStep: { x: 30 },
                cols: 2,
                rowStep: { y: 20 },
                rows: 2,
                template: {
                  name: "star",
                  stroke: "#f8fafc",
                  type: "icon",
                  width: 24,
                  height: 24,
                },
                type: "repeat",
              },
            },
          },
        ],
      })
    ).rejects.toThrow("cannot be referenced from layout node");
  });
});
