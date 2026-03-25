import { describe, expect, it } from "bun:test";

import { videoNodeSchema } from "@/lib/video/schema";

const rectChild = { height: 100, id: "r1", type: "rect", width: 100 };

describe("center node schema", () => {
  it("accepts a center node with one child", () => {
    const result = videoNodeSchema.safeParse({
      children: [rectChild],
      id: "c1",
      type: "center",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a center node with optional width and height", () => {
    const result = videoNodeSchema.safeParse({
      children: [rectChild],
      height: 300,
      id: "c1",
      type: "center",
      width: 400,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a center node with two children", () => {
    const result = videoNodeSchema.safeParse({
      children: [rectChild, { ...rectChild, id: "r2" }],
      id: "c1",
      type: "center",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a center node with no children", () => {
    const result = videoNodeSchema.safeParse({
      children: [],
      id: "c1",
      type: "center",
    });
    expect(result.success).toBe(false);
  });
});

describe("stack node schema", () => {
  it("accepts a vertical stack with children and gap", () => {
    const result = videoNodeSchema.safeParse({
      children: [rectChild, { ...rectChild, id: "r2" }],
      direction: "vertical",
      gap: 16,
      id: "s1",
      type: "stack",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a horizontal stack with optional align", () => {
    const result = videoNodeSchema.safeParse({
      align: "end",
      children: [rectChild],
      direction: "horizontal",
      gap: 8,
      id: "s1",
      type: "stack",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a stack with invalid direction", () => {
    const result = videoNodeSchema.safeParse({
      children: [rectChild],
      direction: "diagonal",
      gap: 0,
      id: "s1",
      type: "stack",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a stack with no children", () => {
    const result = videoNodeSchema.safeParse({
      children: [],
      direction: "vertical",
      gap: 0,
      id: "s1",
      type: "stack",
    });
    expect(result.success).toBe(false);
  });
});

describe("align node schema", () => {
  it("accepts an align node with position and one child", () => {
    const result = videoNodeSchema.safeParse({
      children: [rectChild],
      id: "a1",
      position: "top-center",
      type: "align",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an align node with optional padding", () => {
    const result = videoNodeSchema.safeParse({
      children: [rectChild],
      id: "a1",
      padding: 40,
      position: "bottom-right",
      type: "align",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an align node with invalid position", () => {
    const result = videoNodeSchema.safeParse({
      children: [rectChild],
      id: "a1",
      position: "middle",
      type: "align",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an align node with two children", () => {
    const result = videoNodeSchema.safeParse({
      children: [rectChild, { ...rectChild, id: "r2" }],
      id: "a1",
      position: "center",
      type: "align",
    });
    expect(result.success).toBe(false);
  });
});

describe("layout nodes inside groups", () => {
  it("validates a group containing a center node", () => {
    const result = videoNodeSchema.safeParse({
      children: [
        {
          children: [rectChild],
          id: "c1",
          type: "center",
        },
      ],
      id: "g1",
      type: "group",
    });
    expect(result.success).toBe(true);
  });
});
