import { describe, expect, test } from "bun:test";

import { videoNodeSchema } from "@/lib/video/schema";

import {
  createLucideIconNode,
  createVideoIconNode,
  resolveAiSceneNodes,
} from "./lucide";

describe("lucide video icons", () => {
  test("normalizes raw icon nodes into schema-friendly primitives", () => {
    const node = createVideoIconNode({
      height: 24,
      iconNode: [
        ["polyline", { points: "4 6 10 12 20 4" }],
        ["circle", { cx: "12", cy: "12", r: "2" }],
        ["rect", { height: "4", rx: "1", width: "3", x: "1", y: "2" }],
      ],
      stroke: "#38bdf8",
      width: 24,
    });

    expect(videoNodeSchema.parse(node)).toEqual(node);
    expect(node.elements).toEqual([
      {
        points: [
          [4, 6],
          [10, 12],
          [20, 4],
        ],
        type: "polyline",
      },
      {
        cx: 12,
        cy: 12,
        r: 2,
        type: "circle",
      },
      {
        height: 4,
        rx: 1,
        ry: undefined,
        type: "rect",
        width: 3,
        x: 1,
        y: 2,
      },
    ]);
  });

  test("loads lucide icons by name", async () => {
    const node = await createLucideIconNode({
      height: 48,
      name: "arrow-right",
      stroke: "#f8fafc",
      width: 48,
    });

    expect(videoNodeSchema.parse(node)).toEqual(node);
    expect(node.elements).toEqual([
      { d: "M5 12h14", type: "path" },
      { d: "m12 5 7 7-7 7", type: "path" },
    ]);
  });

  test("resolveAiSceneNodes resolves named icons and passes other nodes through", async () => {
    const resolved = await resolveAiSceneNodes({
      bg: { fill: "#0f172a", height: 400, type: "rect", width: 600 },
      icon: {
        height: 24,
        name: "arrow-right",
        stroke: "#f8fafc",
        type: "icon",
        width: 24,
      },
    });

    expect(videoNodeSchema.parse(resolved.bg)).toEqual(resolved.bg);
    expect(videoNodeSchema.parse(resolved.icon)).toEqual(resolved.icon);

    const icon = resolved.icon;
    if (icon.type !== "icon") {
      throw new Error("expected icon type");
    }
    expect(icon.elements.length).toBeGreaterThan(0);
    expect(icon.elements[0]).toHaveProperty("type", "path");
  });
});
