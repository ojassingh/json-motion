import { describe, expect, it } from "bun:test";

import type { VideoNode } from "@/lib/types/video";
import { resolveLayout } from "@/lib/video/layout";

const FRAME_WIDTH = 960;
const FRAME_HEIGHT = 540;

const rect = (id: string, width: number, height: number): VideoNode =>
  ({ height, id, type: "rect", width }) as VideoNode;

describe("resolveLayout - center", () => {
  it("centers a rect in the frame", () => {
    const nodes: VideoNode[] = [
      {
        children: [rect("r1", 100, 100)],
        id: "c1",
        type: "center",
      } as VideoNode,
    ];

    const result = resolveLayout(nodes, FRAME_WIDTH, FRAME_HEIGHT);
    const child = (result[0] as { children: VideoNode[] })
      .children[0] as VideoNode;

    expect(child.x).toBe(430);
    expect(child.y).toBe(220);
  });

  it("adds child offset to layout-computed position", () => {
    const nodes: VideoNode[] = [
      {
        children: [{ ...rect("r1", 100, 100), x: 10, y: 5 }],
        id: "c1",
        type: "center",
      } as VideoNode,
    ];

    const result = resolveLayout(nodes, FRAME_WIDTH, FRAME_HEIGHT);
    const child = (result[0] as { children: VideoNode[] })
      .children[0] as VideoNode;

    expect(child.x).toBe(440);
    expect(child.y).toBe(225);
  });

  it("uses explicit width/height when provided", () => {
    const nodes: VideoNode[] = [
      {
        children: [rect("r1", 100, 100)],
        height: 200,
        id: "c1",
        type: "center",
        width: 400,
      } as VideoNode,
    ];

    const result = resolveLayout(nodes, FRAME_WIDTH, FRAME_HEIGHT);
    const child = (result[0] as { children: VideoNode[] })
      .children[0] as VideoNode;

    expect(child.x).toBe(150);
    expect(child.y).toBe(50);
  });
});

describe("resolveLayout - stack", () => {
  it("positions children vertically with gap", () => {
    const nodes: VideoNode[] = [
      {
        children: [
          rect("r1", 100, 50),
          rect("r2", 100, 50),
          rect("r3", 100, 50),
        ],
        direction: "vertical",
        gap: 16,
        id: "s1",
        type: "stack",
      } as VideoNode,
    ];

    const result = resolveLayout(nodes, FRAME_WIDTH, FRAME_HEIGHT);
    const children = (result[0] as { children: VideoNode[] })
      .children as VideoNode[];

    expect(children[0]?.y).toBe(0);
    expect(children[1]?.y).toBe(66);
    expect(children[2]?.y).toBe(132);
  });

  it("positions children horizontally with gap", () => {
    const nodes: VideoNode[] = [
      {
        children: [rect("r1", 80, 50), rect("r2", 80, 50)],
        direction: "horizontal",
        gap: 10,
        id: "s1",
        type: "stack",
      } as VideoNode,
    ];

    const result = resolveLayout(nodes, FRAME_WIDTH, FRAME_HEIGHT);
    const children = (result[0] as { children: VideoNode[] })
      .children as VideoNode[];

    expect(children[0]?.x).toBe(0);
    expect(children[1]?.x).toBe(90);
  });

  it("applies end alignment on cross axis", () => {
    const nodes: VideoNode[] = [
      {
        align: "end",
        children: [rect("r1", 80, 50), rect("r2", 60, 30)],
        direction: "horizontal",
        gap: 0,
        id: "s1",
        type: "stack",
      } as VideoNode,
    ];

    const result = resolveLayout(nodes, FRAME_WIDTH, FRAME_HEIGHT);
    const children = (result[0] as { children: VideoNode[] })
      .children as VideoNode[];

    expect(children[0]?.y).toBe(0);
    expect(children[1]?.y).toBe(20);
  });
});

describe("resolveLayout - align", () => {
  it("positions to top-center with padding", () => {
    const nodes: VideoNode[] = [
      {
        children: [rect("r1", 200, 50)],
        id: "a1",
        padding: 40,
        position: "top-center",
        type: "align",
      } as VideoNode,
    ];

    const result = resolveLayout(nodes, FRAME_WIDTH, FRAME_HEIGHT);
    const child = (result[0] as { children: VideoNode[] })
      .children[0] as VideoNode;

    expect(child.x).toBe(380);
    expect(child.y).toBe(40);
  });

  it("positions to bottom-right with padding", () => {
    const nodes: VideoNode[] = [
      {
        children: [rect("r1", 200, 100)],
        id: "a1",
        padding: 24,
        position: "bottom-right",
        type: "align",
      } as VideoNode,
    ];

    const result = resolveLayout(nodes, FRAME_WIDTH, FRAME_HEIGHT);
    const child = (result[0] as { children: VideoNode[] })
      .children[0] as VideoNode;

    expect(child.x).toBe(736);
    expect(child.y).toBe(416);
  });

  it("positions to center with no padding", () => {
    const nodes: VideoNode[] = [
      {
        children: [rect("r1", 100, 100)],
        id: "a1",
        position: "center",
        type: "align",
      } as VideoNode,
    ];

    const result = resolveLayout(nodes, FRAME_WIDTH, FRAME_HEIGHT);
    const child = (result[0] as { children: VideoNode[] })
      .children[0] as VideoNode;

    expect(child.x).toBe(430);
    expect(child.y).toBe(220);
  });
});

describe("resolveLayout - nested", () => {
  it("resolves a centered stack", () => {
    const nodes: VideoNode[] = [
      {
        children: [
          {
            children: [rect("r1", 100, 50), rect("r2", 100, 50)],
            direction: "vertical",
            gap: 10,
            id: "s1",
            type: "stack",
          } as VideoNode,
        ],
        id: "c1",
        type: "center",
      } as VideoNode,
    ];

    const result = resolveLayout(nodes, FRAME_WIDTH, FRAME_HEIGHT);
    const stack = (result[0] as { children: VideoNode[] }).children[0] as {
      children: VideoNode[];
      x: number;
      y: number;
    };

    expect(stack.x).toBe(430);
    expect(stack.y).toBe(215);
  });
});
