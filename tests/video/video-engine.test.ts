import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

import type { VideoDescription } from "@/lib/types/video";
import { resolveFrame, resolveVideoNode } from "@/lib/video/animation";
import { sampleVideoDescription } from "@/lib/video/fixtures/sample-video-description";
import { preRenderMathNodes } from "@/lib/video/math";
import { videoDescriptionSchema } from "@/lib/video/schema";
import { getSceneForFrame, getTotalFrameCount } from "@/lib/video/timeline";

const ffmpegIsAvailable =
  spawnSync("ffmpeg", ["-version"], {
    stdio: "ignore",
  }).status === 0;
const skiaCanvasIsAvailable = (() => {
  try {
    import.meta.resolve("skia-canvas");
    return true;
  } catch {
    return false;
  }
})();

describe("videoDescriptionSchema", () => {
  it("accepts the sample video description", () => {
    const result = videoDescriptionSchema.safeParse(sampleVideoDescription);

    expect(result.success).toBe(true);
  });

  it("requires at least one scene", () => {
    const result = videoDescriptionSchema.safeParse({
      ...sampleVideoDescription,
      scenes: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects legacy animation arrays and transform objects", () => {
    const result = videoDescriptionSchema.safeParse({
      ...sampleVideoDescription,
      scenes: [
        {
          ...sampleVideoDescription.scenes[0],
          nodes: [
            {
              fill: "#38bdf8",
              height: 48,
              id: "legacy-rect",
              animations: [],
              transform: { x: 88, y: 280 },
              type: "rect",
              width: 180,
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects frame-based animate objects", () => {
    const result = videoDescriptionSchema.safeParse({
      ...sampleVideoDescription,
      scenes: [
        {
          ...sampleVideoDescription.scenes[0],
          nodes: [
            {
              animate: { opacity: { from: 0, to: 1, start: 0, end: 15 } },
              fill: "#38bdf8",
              height: 48,
              id: "old-animate",
              type: "rect",
              width: 180,
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("accepts nodes with initial + transition", () => {
    const result = videoDescriptionSchema.safeParse({
      ...sampleVideoDescription,
      scenes: [
        {
          ...sampleVideoDescription.scenes[0],
          nodes: [
            {
              fill: "#38bdf8",
              height: 48,
              id: "animated-rect",
              initial: { opacity: 0, y: 20 },
              transition: {
                delay: "0.1s",
                duration: "0.4s",
                easing: "ease-out",
              },
              type: "rect",
              width: 180,
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("accepts nodes with exit + exitTransition", () => {
    const result = videoDescriptionSchema.safeParse({
      ...sampleVideoDescription,
      scenes: [
        {
          ...sampleVideoDescription.scenes[0],
          nodes: [
            {
              fill: "#38bdf8",
              height: 48,
              id: "exiting-rect",
              exit: { opacity: 0 },
              exitTransition: { duration: "0.2s" },
              type: "rect",
              width: 180,
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects transition with invalid duration format", () => {
    const result = videoDescriptionSchema.safeParse({
      ...sampleVideoDescription,
      scenes: [
        {
          ...sampleVideoDescription.scenes[0],
          nodes: [
            {
              fill: "#38bdf8",
              height: 48,
              id: "bad-transition",
              initial: { opacity: 0 },
              transition: { duration: 30 },
              type: "rect",
              width: 180,
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("serializes provider-compatible arrays without prefixItems", () => {
    const jsonSchema = z.toJSONSchema(videoDescriptionSchema);
    const serializedSchema = JSON.stringify(jsonSchema);

    expect(serializedSchema.includes('"prefixItems"')).toBe(false);
  });

  it("rejects duplicate node ids within the same scene", () => {
    const [introScene] = sampleVideoDescription.scenes;

    if (!introScene) {
      throw new Error("Sample fixture must include an intro scene.");
    }

    const result = videoDescriptionSchema.safeParse({
      ...sampleVideoDescription,
      scenes: [
        {
          ...introScene,
          nodes: [
            introScene.nodes[0],
            {
              ...introScene.nodes[0],
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes("Duplicate node id")
        )
      ).toBe(true);
    }
  });
});

describe("timeline helpers", () => {
  it("computes frame count from the furthest scene end", () => {
    expect(getTotalFrameCount(sampleVideoDescription)).toBe(24);
  });

  it("selects the active scene for an absolute frame", () => {
    const scene = getSceneForFrame(sampleVideoDescription, 8);

    expect(scene?.id).toBe("intro");
  });
});

describe("animation resolution", () => {
  it("resolves primitive and initial/transition animations deterministically", () => {
    const [introScene] = sampleVideoDescription.scenes;

    if (!introScene) {
      throw new Error("Sample fixture must include an intro scene.");
    }

    // accent-bar has initial: { scale: 0.9 }, transition: { duration: "0.4s" }
    // At 60fps, duration = 24 frames. At frame 12, progress ≈ 0.52 → eased ≈ 0.77
    // scaleX/scaleY = 0.9 + (1 - 0.9) * 0.77 ≈ 0.977
    const accentBarNode = introScene.nodes[2];

    if (!accentBarNode) {
      throw new Error("Sample fixture must include the accent bar node.");
    }

    const resolvedNode = resolveVideoNode(
      accentBarNode,
      sampleVideoDescription.fps,
      introScene.duration,
      12,
      2
    );

    expect(resolvedNode.scaleX).toBeGreaterThan(0.95);
    expect(resolvedNode.scaleY).toBeGreaterThan(0.95);
  });

  it("lets initial/transition override primitives for the same property", () => {
    // SlideIn would animate y from (50+40)=90 → 50.
    // Explicit initial.y = 10 overrides SlideIn's y animation.
    // At 30fps, duration "1s" = 30 frames. At frame 15, linear progress = 0.5.
    // y = 10 + (50 - 10) * 0.5 = 30.
    const resolvedNode = resolveVideoNode(
      {
        height: 80,
        id: "override",
        initial: { y: 10 },
        primitives: ["SlideIn"],
        transition: { duration: "1s", easing: "linear" },
        type: "rect",
        width: 80,
        x: 10,
        y: 50,
      },
      30,
      60,
      15,
      0
    );

    expect(resolvedNode.y).toBe(30);
  });

  it("enter and exit animations both apply on the same property", () => {
    // Enter: opacity 0 → 1 over frames 0–11 (0.2s at 60fps)
    // Exit:  opacity 1 → 0 over frames 48–59 (0.2s at 60fps, scene = 60 frames)
    const resolvedAtStart = resolveVideoNode(
      {
        exit: { opacity: 0 },
        exitTransition: { duration: "0.2s" },
        height: 80,
        id: "enter-exit",
        initial: { opacity: 0 },
        transition: { duration: "0.2s" },
        type: "rect",
        width: 80,
      },
      60,
      60,
      0,
      0
    );

    const resolvedAtMid = resolveVideoNode(
      {
        exit: { opacity: 0 },
        exitTransition: { duration: "0.2s" },
        height: 80,
        id: "enter-exit",
        initial: { opacity: 0 },
        transition: { duration: "0.2s" },
        type: "rect",
        width: 80,
      },
      60,
      60,
      30,
      0
    );

    // At frame 0: opacity should be 0 (start of enter animation)
    expect(resolvedAtStart.opacity).toBe(0);
    // At frame 30: fully visible (between enter end and exit start)
    expect(resolvedAtMid.opacity).toBe(1);
  });

  it("resolves math node dimensions from the pre-render cache", async () => {
    const scene = {
      duration: 60,
      id: "math-scene",
      nodes: [
        {
          fontSize: 56,
          id: "math-1",
          latex: "E = mc^2",
          type: "math",
        },
      ],
      startFrame: 0,
    } satisfies VideoDescription["scenes"][number];
    const mathNode = scene.nodes[0];

    if (!mathNode || mathNode.type !== "math") {
      throw new Error("Expected math node.");
    }

    const mathImages = await preRenderMathNodes([scene]);
    const resolvedNode = resolveVideoNode(mathNode, 60, scene.duration, 0, 0, {
      graphPoints: new Map<string, { x: number; y: number }[]>(),
      mathImages,
    });
    const image = mathImages.get(`${mathNode.latex}::#f8fafc`);

    if (!image || resolvedNode.type !== "math") {
      throw new Error("Expected resolved math node.");
    }

    expect(resolvedNode.height).toBe(56);
    expect(resolvedNode.width).toBeCloseTo(
      image.width * (56 / image.height),
      5
    );
  });

  it("returns a resolved frame with background and nodes", () => {
    const resolvedFrame = resolveFrame(sampleVideoDescription, 4);

    expect(resolvedFrame.background).toBeDefined();
    expect(resolvedFrame.nodes.length).toBe(3);
    expect(resolvedFrame.localFrame).toBe(4);
  });

  it("uses static scene background color", () => {
    const videoDescription: VideoDescription = {
      background: "#07111f",
      fps: 60,
      height: 360,
      scenes: [
        {
          background: "#3b82f6",
          duration: 60,
          id: "static-bg",
          nodes: [],
          startFrame: 0,
        },
      ],
      width: 640,
    };

    const resolvedFrame = resolveFrame(videoDescription, 30);

    expect(resolvedFrame.background).toBe("#3b82f6");
  });
});

const integrationTest =
  ffmpegIsAvailable && skiaCanvasIsAvailable ? it : it.skip;

describe("renderVideo", () => {
  integrationTest("renders the sample fixture into an MP4 file", async () => {
    const { renderVideo } = await import("@/lib/video/render-video");
    const temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), "motion-render-")
    );
    const outputFilePath = path.join(temporaryDirectory, "fixture.mp4");

    try {
      const renderResult = await renderVideo(sampleVideoDescription, {
        outputFilePath,
      });

      expect(renderResult.frameCount).toBe(24);

      const fileStats = await stat(outputFilePath);
      const fileBuffer = await readFile(outputFilePath);

      expect(fileStats.size).toBeGreaterThan(0);
      expect(fileBuffer.length).toBeGreaterThan(0);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
