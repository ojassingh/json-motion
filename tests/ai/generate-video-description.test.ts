import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { z } from "zod";

import { PROMPT_TO_VIDEO_SYSTEM_PROMPT } from "@/lib/ai/prompt-to-video-config";
import type { VideoAiOutput, VideoDescription } from "@/lib/types/video";
import { videoAiOutputSchema } from "@/lib/video/schema";

const aiSdk = await import("ai");
const { convertAiOutputToVideoDescription, generateSceneJson } = await import(
  "@/lib/actions/ai"
);

const sampleAiOutput: VideoAiOutput = {
  background: "#0b1020",
  scenes: [
    {
      background: "#0b1020",
      duration: "1s",
      id: "intro",
      nodes: [
        {
          fill: "#f97316",
          height: 180,
          id: "square",
          type: "rect",
          width: 180,
          x: 390,
          y: 180,
        },
      ],
    },
  ],
};

const sampleVideoDescription: VideoDescription =
  convertAiOutputToVideoDescription(sampleAiOutput);

describe("generateSceneJson", () => {
  const originalGatewayKey = process.env.AI_GATEWAY_API_KEY;

  afterEach(() => {
    mock.restore();

    if (originalGatewayKey) {
      process.env.AI_GATEWAY_API_KEY = originalGatewayKey;
      return;
    }

    process.env.AI_GATEWAY_API_KEY = "";
  });

  it("returns a configuration error when the gateway key is missing", async () => {
    const generateText = spyOn(aiSdk, "generateText");
    process.env.AI_GATEWAY_API_KEY = "";

    await expect(generateSceneJson("a simple square")).rejects.toMatchObject({
      code: "CONFIGURATION_ERROR",
      details: ["Set AI_GATEWAY_API_KEY before calling /api/generate-video."],
      status: 500,
    });

    expect(generateText).not.toHaveBeenCalled();
  });

  it("uses a provider-compatible structured output schema", () => {
    const jsonSchema = z.toJSONSchema(videoAiOutputSchema);
    const serializedSchema = JSON.stringify(jsonSchema);

    expect(serializedSchema.includes('"prefixItems"')).toBe(false);
  });

  it("documents layout primitives and anchor values in the generated prompt", () => {
    expect(PROMPT_TO_VIDEO_SYSTEM_PROMPT).toContain("center");
    expect(PROMPT_TO_VIDEO_SYSTEM_PROMPT).toContain("stack");
    expect(PROMPT_TO_VIDEO_SYSTEM_PROMPT).toContain("align");
    expect(PROMPT_TO_VIDEO_SYSTEM_PROMPT).toContain("anchor");
    expect(PROMPT_TO_VIDEO_SYSTEM_PROMPT).toContain("x");
    expect(PROMPT_TO_VIDEO_SYSTEM_PROMPT).toContain("y");
  });

  it("uses the explicit gateway provider and returns the generated scene", async () => {
    const gateway = spyOn(aiSdk, "gateway");
    const generateText = spyOn(aiSdk, "generateText");
    process.env.AI_GATEWAY_API_KEY = "test-key";
    gateway.mockReturnValueOnce({
      modelId: "openai/gpt-5.4",
      provider: "gateway",
    } as unknown as ReturnType<typeof aiSdk.gateway>);
    generateText.mockResolvedValueOnce({
      finishReason: "stop",
      output: sampleAiOutput,
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
      },
      warnings: [],
    } as unknown as Awaited<ReturnType<typeof aiSdk.generateText>>);

    await expect(generateSceneJson("a simple square")).resolves.toEqual(
      sampleVideoDescription
    );

    expect(gateway).toHaveBeenCalledWith("openai/gpt-5.4");
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("normalizes upstream model failures", async () => {
    const gateway = spyOn(aiSdk, "gateway");
    const generateText = spyOn(aiSdk, "generateText");
    process.env.AI_GATEWAY_API_KEY = "test-key";
    gateway.mockReturnValueOnce({
      modelId: "openai/gpt-5.4",
      provider: "gateway",
    } as unknown as ReturnType<typeof aiSdk.gateway>);
    generateText.mockRejectedValueOnce(new Error("gateway schema mismatch"));

    await expect(generateSceneJson("a simple square")).rejects.toMatchObject({
      code: "GENERATION_ERROR",
      details: ["gateway schema mismatch"],
      status: 502,
    });
  });

  it("converts AI scene durations into engine timing", () => {
    const videoDescription = convertAiOutputToVideoDescription({
      scenes: [
        { duration: "2s", id: "scene-1", nodes: [] },
        { duration: "1.5s", id: "scene-2", nodes: [] },
      ],
    });

    expect(videoDescription.scenes[0]?.duration).toBe(120);
    expect(videoDescription.scenes[0]?.startFrame).toBe(0);
    expect(videoDescription.scenes[1]?.duration).toBe(90);
    expect(videoDescription.scenes[1]?.startFrame).toBe(120);
  });
});
