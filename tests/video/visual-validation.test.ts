import { describe, expect, it } from "bun:test";

import type { VideoDescription } from "@/lib/types/video";
import { collectVisualWarnings } from "@/lib/video/visual-validation";

const makeDescription = (
  nodes: VideoDescription["scenes"][0]["nodes"]
): VideoDescription => ({
  fps: 60,
  height: 540,
  scenes: [{ duration: 60, id: "s1", nodes, startFrame: 0 }],
  width: 960,
});

describe("collectVisualWarnings - off-screen detection", () => {
  it("warns when a rect is entirely to the right of the frame", () => {
    const warnings = collectVisualWarnings(
      makeDescription([
        {
          anchor: "top-left",
          height: 100,
          id: "r1",
          type: "rect",
          width: 100,
          x: 1100,
          y: 0,
        },
      ])
    );

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]?.nodeId).toBe("r1");
    expect(warnings[0]?.message).toContain("off-screen");
  });

  it("does not warn when a rect is partially visible", () => {
    const warnings = collectVisualWarnings(
      makeDescription([
        {
          anchor: "top-left",
          height: 100,
          id: "r1",
          type: "rect",
          width: 100,
          x: 900,
          y: 0,
        },
      ])
    );

    const offScreenWarnings = warnings.filter((w) =>
      w.message.includes("off-screen")
    );
    expect(offScreenWarnings.length).toBe(0);
  });

  it("does not warn when a rect is fully visible", () => {
    const warnings = collectVisualWarnings(
      makeDescription([
        { height: 100, id: "r1", type: "rect", width: 100, x: 100, y: 100 },
      ])
    );

    expect(warnings.length).toBe(0);
  });

  it("warns when a rect is entirely above the frame", () => {
    const warnings = collectVisualWarnings(
      makeDescription([
        {
          anchor: "top-left",
          height: 100,
          id: "r1",
          type: "rect",
          width: 100,
          x: 0,
          y: -200,
        },
      ])
    );

    expect(warnings.some((w) => w.message.includes("off-screen"))).toBe(true);
  });
});

describe("collectVisualWarnings - zero-dimension detection", () => {
  it("warns when animate.width starts at zero at frame 0", () => {
    const warnings = collectVisualWarnings(
      makeDescription([
        {
          animate: { width: { end: 30, from: 0, start: 0, to: 100 } },
          height: 100,
          id: "r1",
          type: "rect",
          width: 100,
        },
      ])
    );

    const zeroDimWarnings = warnings.filter((w) =>
      w.message.includes("zero effective")
    );
    expect(zeroDimWarnings.length).toBeGreaterThan(0);
  });

  it("does not warn when width animation starts after frame 0", () => {
    const warnings = collectVisualWarnings(
      makeDescription([
        {
          animate: { width: { end: 60, from: 50, start: 30, to: 100 } },
          height: 100,
          id: "r1",
          type: "rect",
          width: 100,
        },
      ])
    );

    const zeroDimWarnings = warnings.filter((w) =>
      w.message.includes("zero effective")
    );
    expect(zeroDimWarnings.length).toBe(0);
  });
});

describe("collectVisualWarnings - valid scene", () => {
  it("produces no warnings for a normal visible rect", () => {
    const warnings = collectVisualWarnings(
      makeDescription([
        { height: 200, id: "r1", type: "rect", width: 200, x: 100, y: 100 },
      ])
    );

    expect(warnings.length).toBe(0);
  });

  it("produces no warnings for an empty scene", () => {
    const warnings = collectVisualWarnings(makeDescription([]));
    expect(warnings.length).toBe(0);
  });
});
