import { afterEach, describe, expect, it, mock } from "bun:test";

import { PromptToVideoError } from "@/lib/prompt-to-video/errors";
import type { PromptToVideoSuccessResponse } from "@/lib/types/prompt-to-video";

const generateVideoFromPrompt = mock(async () => sampleSuccessResponse);

mock.module("@/lib/prompt-to-video/generate-video", () => ({
  generateVideoFromPrompt,
}));

const { POST } = await import("./route");

const sampleSuccessResponse: PromptToVideoSuccessResponse = {
  scene: {
    background: "#0b1020",
    fps: 12,
    height: 540,
    scenes: [
      {
        background: "#0b1020",
        durationInFrames: 72,
        id: "intro",
        nodes: [
          {
            fill: "#121a30",
            height: 340,
            id: "panel",
            radius: 32,
            transform: {
              x: 96,
              y: 100,
            },
            type: "rect",
            width: 768,
          },
        ],
        startFrame: 0,
      },
    ],
    width: 960,
  },
  video: {
    codec: "h264",
    fps: 12,
    frameCount: 72,
    height: 540,
    jobId: "job-123",
    url: "/renders/job-123.mp4",
    width: 960,
  },
};

const createRequest = (body: string): Request =>
  new Request("http://localhost/api/generate-video", {
    body,
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

describe("POST /api/generate-video", () => {
  afterEach(() => {
    generateVideoFromPrompt.mockReset();
  });

  it("returns the prompt-to-video success response", async () => {
    generateVideoFromPrompt.mockResolvedValueOnce(sampleSuccessResponse);

    const response = await POST(
      createRequest(JSON.stringify({ prompt: "A modern launch trailer" }))
    );

    expect(response.status).toBe(200);
    expect(generateVideoFromPrompt).toHaveBeenCalledWith({
      prompt: "A modern launch trailer",
    });
    await expect(response.json()).resolves.toEqual(sampleSuccessResponse);
  });

  it("returns a validation error when the request body is invalid JSON", async () => {
    const response = await POST(createRequest("{"));

    expect(response.status).toBe(400);
    expect(generateVideoFromPrompt).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        details: ["Request body must be valid JSON."],
        message: "Prompt request validation failed.",
      },
    });
  });

  it("returns machine-readable failures from the service layer", async () => {
    generateVideoFromPrompt.mockRejectedValueOnce(
      new PromptToVideoError(
        "GENERATION_ERROR",
        "AI scene generation failed.",
        {
          details: ["schema mismatch"],
          status: 502,
        }
      )
    );

    const response = await POST(
      createRequest(JSON.stringify({ prompt: "A photorealistic explosion" }))
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "GENERATION_ERROR",
        details: ["schema mismatch"],
        message: "AI scene generation failed.",
      },
    });
  });
});
