import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { z } from "zod";

import { PROMPT_TO_VIDEO_SYSTEM_PROMPT } from "@/lib/ai/prompt-to-video-config";
import type { VideoDescription } from "@/lib/types/video";
import { videoDescriptionSchema } from "@/lib/video/schema";

const aiSdk = await import("ai");
const { generateSceneJson } = await import("@/lib/actions/ai");

const sampleVideoDescription: VideoDescription = {
  background: "#0b1020",
  fps: 12,
  height: 540,
  scenes: [
    {
      background: "#0b1020",
      duration: 60,
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
      startFrame: 0,
    },
  ],
  width: 960,
};

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
    const jsonSchema = z.toJSONSchema(videoDescriptionSchema);
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
      output: sampleVideoDescription,
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
});
