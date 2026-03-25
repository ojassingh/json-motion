import { describe, expect, it } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { generateSceneJson } from "@/lib/actions/ai";
import { renderVideo } from "@/lib/video/render-video";
import { videoDescriptionSchema } from "@/lib/video/schema";

const TIMEOUT_MS = 180_000;

describe("math and graph node integration", () => {
  it(
    "generates a video with math/graph nodes and renders it end-to-end",
    async () => {
      const videoDescription = await generateSceneJson(
        "Show the equation E=mc^2 and a sine wave graph animating from left to right"
      );

      const parseResult = videoDescriptionSchema.safeParse(videoDescription);
      expect(parseResult.success).toBe(true);

      const allNodes = videoDescription.scenes.flatMap((scene) => scene.nodes);
      const hasNewNodeType = allNodes.some(
        (node) =>
          node.type === "math" ||
          node.type === "functionGraph" ||
          node.type === "parametricGraph"
      );
      expect(hasNewNodeType).toBe(true);

      const outputPath = path.join(
        tmpdir(),
        `math-video-test-${Date.now()}.mp4`
      );

      const result = await renderVideo(videoDescription, {
        outputFilePath: outputPath,
      });

      expect(result.filePath).toBe(outputPath);
      expect(existsSync(outputPath)).toBe(true);
      expect(statSync(outputPath).size).toBeGreaterThan(0);
    },
    TIMEOUT_MS
  );
});
