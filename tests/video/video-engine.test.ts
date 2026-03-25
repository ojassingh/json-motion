import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

import type { VideoDescription } from "@/lib/types/video";
import { resolveFrame, resolveVideoNode } from "@/lib/video/animation";
import { lerpOklch } from "@/lib/video/color";
import { sampleVideoDescription } from "@/lib/video/fixtures/sample-video-description";
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

  it("rejects animation windows that exceed the scene duration", () => {
    const result = videoDescriptionSchema.safeParse({
      ...sampleVideoDescription,
      scenes: [
        {
          ...sampleVideoDescription.scenes[0],
          nodes: [
            {
              animate: {
                opacity: {
                  end: 24,
                  from: 0,
                  to: 1,
                },
              },
              fill: "#38bdf8",
              height: 48,
              id: "too-long",
              type: "rect",
              width: 180,
              x: 88,
              y: 280,
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
  it("resolves primitive and explicit animations deterministically", () => {
    const [introScene] = sampleVideoDescription.scenes;

    if (!introScene) {
      throw new Error("Sample fixture must include an intro scene.");
    }

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

  it("lets explicit animate values override primitive-derived values", () => {
    const resolvedNode = resolveVideoNode(
      {
        animate: {
          y: {
            easing: "linear",
            end: "1s",
            from: 10,
            to: 50,
          },
        },
        height: 80,
        id: "override",
        primitives: ["SlideIn"],
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

  it("interpolates animated backgrounds in OKLCH", () => {
    const videoDescription: VideoDescription = {
      background: "#07111f",
      fps: 12,
      height: 360,
      scenes: [
        {
          background: {
            easing: "linear",
            end: 8,
            from: "#3b82f6",
            to: "#f43f5e",
          },
          duration: 9,
          id: "background-test",
          nodes: [],
          startFrame: 0,
        },
      ],
      width: 640,
    };

    const resolvedFrame = resolveFrame(videoDescription, 4);

    expect(resolvedFrame.background).toBe(lerpOklch("#3b82f6", "#f43f5e", 0.5));
  });

  it("returns a resolved frame with background and nodes", () => {
    const resolvedFrame = resolveFrame(sampleVideoDescription, 4);

    expect(resolvedFrame.background).toBeDefined();
    expect(resolvedFrame.nodes.length).toBe(3);
    expect(resolvedFrame.localFrame).toBe(4);
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
