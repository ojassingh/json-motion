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

describe("video arrows", () => {
  test("accepts an arrow that points at a node from above", () => {
    const result = videoDescriptionSchema.safeParse({
      ...baseDescription,
      scenes: [
        {
          ...baseDescription.scenes[0],
          nodes: {
            arrow: {
              headSize: 10,
              position: "above",
              stroke: "#f8fafc",
              strokeWidth: 4,
              target: "box",
              type: "arrow",
            },
            box: {
              fill: "#38bdf8",
              height: 48,
              type: "rect",
              width: 96,
              x: 112,
              y: 60,
            },
          },
        },
      ],
    });

    expect(result.success).toBeTrue();
  });

  test("rejects arrows that mix target placement with explicit endpoints", () => {
    const result = videoDescriptionSchema.safeParse({
      ...baseDescription,
      scenes: [
        {
          ...baseDescription.scenes[0],
          nodes: {
            arrow: {
              from: { x: 24, y: 24 },
              position: "left",
              target: "box",
              to: { x: 96, y: 48 },
              type: "arrow",
            },
            box: {
              fill: "#38bdf8",
              height: 48,
              type: "rect",
              width: 96,
              x: 112,
              y: 60,
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

  test("expands repeated arrows and fans timeline targets out to copies", async () => {
    const description = await convertAiOutputToVideoDescription({
      scenes: [
        {
          duration: 1,
          id: "scene-1",
          nodes: {
            diagonal: {
              colStep: { x: 30, y: 0 },
              cols: 2,
              rowStep: { x: 20, y: 10 },
              rows: 2,
              template: {
                from: { x: 0, y: 0 },
                stroke: "#f8fafc",
                strokeWidth: 3,
                to: { x: 24, y: 0 },
                type: "arrow",
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

    const repeatedArrow = scene.nodes.diagonal_r1_c1;
    if (!repeatedArrow || repeatedArrow.type !== "arrow") {
      throw new Error("expected repeated arrow node");
    }
    expect(repeatedArrow.x).toBe(50);
    expect(repeatedArrow.y).toBe(10);

    const event = scene.timeline?.[0];
    expect(event?.target).toEqual([
      "diagonal_r0_c0",
      "diagonal_r0_c1",
      "diagonal_r1_c0",
      "diagonal_r1_c1",
    ]);
  });
});
