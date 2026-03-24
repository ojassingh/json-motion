import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

import { resolveFrame, resolveNodeTransform } from "@/lib/video/animation";
import { sampleVideoDescription } from "@/lib/video/fixtures/sample-video-description";
import { renderVideo } from "@/lib/video/render-video";
import { videoDescriptionSchema } from "@/lib/video/schema";
import { getSceneForFrame, getTotalFrameCount } from "@/lib/video/timeline";

const ffmpegIsAvailable =
  spawnSync("ffmpeg", ["-version"], {
    stdio: "ignore",
  }).status === 0;

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

  it("requires at least two keyframes for keyframe animations", () => {
    const result = videoDescriptionSchema.safeParse({
      ...sampleVideoDescription,
      scenes: [
        {
          ...sampleVideoDescription.scenes[0],
          nodes: [
            {
              animations: [
                {
                  endFrame: 23,
                  keyframes: [
                    {
                      frame: 0,
                      value: 0,
                    },
                  ],
                  property: "rotation",
                  startFrame: 0,
                  type: "keyframes",
                },
              ],
              fill: "#38bdf8",
              height: 48,
              id: "accent-bar",
              transform: {
                x: 88,
                y: 280,
              },
              type: "rect",
              width: 180,
            },
          ],
          startFrame: 0,
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
  it("resolves named effects and keyframes deterministically", () => {
    const [introScene] = sampleVideoDescription.scenes;

    if (!introScene) {
      throw new Error("Sample fixture must include an intro scene.");
    }

    const accentBarNode = introScene.nodes[2];

    if (!accentBarNode) {
      throw new Error("Sample fixture must include the accent bar node.");
    }

    const resolvedTransform = resolveNodeTransform(accentBarNode, 12);

    expect(resolvedTransform.scaleX).toBeGreaterThan(0.95);
    expect(resolvedTransform.scaleY).toBeGreaterThan(0.95);
  });

  it("returns a resolved frame with background and nodes", () => {
    const resolvedFrame = resolveFrame(sampleVideoDescription, 4);

    expect(resolvedFrame.background).toBe("#07111f");
    expect(resolvedFrame.nodes.length).toBe(3);
    expect(resolvedFrame.localFrame).toBe(4);
  });
});

const integrationTest = ffmpegIsAvailable ? it : it.skip;

describe("renderVideo", () => {
  integrationTest("renders the sample fixture into an MP4 file", async () => {
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
