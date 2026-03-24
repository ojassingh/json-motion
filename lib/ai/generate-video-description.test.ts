import { afterEach, describe, expect, it, mock } from "bun:test";
import type { VideoDescription } from "@/lib/types/video";

const generateText = mock(async () => ({
  output: sampleVideoDescription,
}));

const gateway = mock((modelId: string) => ({
  provider: "gateway",
  modelId,
}));

mock.module("ai", () => ({
  Output: {
    object: (options: unknown) => options,
  },
  gateway,
  generateText,
}));

const { generateVideoDescriptionFromPrompt } = await import(
  "./generate-video-description-core"
);

const sampleVideoDescription: VideoDescription = {
  background: "#0b1020",
  fps: 12,
  height: 540,
  scenes: [
    {
      background: "#0b1020",
      durationInFrames: 60,
      id: "intro",
      nodes: [
        {
          fill: "#f97316",
          height: 180,
          id: "square",
          transform: {
            x: 390,
            y: 180,
          },
          type: "rect",
          width: 180,
        },
      ],
      startFrame: 0,
    },
  ],
  width: 960,
};

describe("generateVideoDescriptionFromPrompt", () => {
  const originalGatewayKey = process.env.AI_GATEWAY_API_KEY;

  afterEach(() => {
    generateText.mockReset();
    generateText.mockImplementation(async () => ({
      output: sampleVideoDescription,
    }));
    gateway.mockReset();
    gateway.mockImplementation((modelId: string) => ({
      provider: "gateway",
      modelId,
    }));

    if (originalGatewayKey) {
      process.env.AI_GATEWAY_API_KEY = originalGatewayKey;
      return;
    }

    process.env.AI_GATEWAY_API_KEY = "";
  });

  it("returns a configuration error when the gateway key is missing", async () => {
    process.env.AI_GATEWAY_API_KEY = "";

    await expect(
      generateVideoDescriptionFromPrompt("a simple square")
    ).rejects.toMatchObject({
      code: "CONFIGURATION_ERROR",
      details: ["Set AI_GATEWAY_API_KEY before calling /api/generate-video."],
      status: 500,
    });

    expect(generateText).not.toHaveBeenCalled();
  });

  it("uses the explicit gateway provider and returns the generated scene", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";

    await expect(
      generateVideoDescriptionFromPrompt("a simple square")
    ).resolves.toEqual(sampleVideoDescription);

    expect(gateway).toHaveBeenCalledWith("openai/gpt-5.4");
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("normalizes upstream model failures", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    generateText.mockRejectedValueOnce(new Error("gateway schema mismatch"));

    await expect(
      generateVideoDescriptionFromPrompt("a simple square")
    ).rejects.toMatchObject({
      code: "GENERATION_ERROR",
      details: ["gateway schema mismatch"],
      status: 502,
    });
  });
});
