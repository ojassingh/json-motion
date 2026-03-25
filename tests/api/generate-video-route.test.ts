import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

import { AppError } from "@/lib/errors";
import type { PromptToVideoSuccessResponse } from "@/lib/types/prompt-to-video";

const promptToVideoModule = await import(
  "@/lib/prompt-to-video/generate-video"
);
const { POST } = await import("@/app/api/generate-video/route");

const sampleSuccessResponse: PromptToVideoSuccessResponse = {
  scene: {
    background: "#0b1020",
    fps: 12,
    height: 540,
    scenes: [
      {
        background: "#0b1020",
        duration: 72,
        id: "intro",
        nodes: [
          {
            fill: "#121a30",
            height: 340,
            id: "panel",
            cornerRadius: 32,
            type: "rect",
            width: 768,
            x: 96,
            y: 100,
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
    mock.restore();
  });

  it("returns the prompt-to-video success response", async () => {
    const generateVideoFromPrompt = spyOn(
      promptToVideoModule,
      "generateVideoFromPrompt"
    );
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
    const generateVideoFromPrompt = spyOn(
      promptToVideoModule,
      "generateVideoFromPrompt"
    );

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

  it("returns machine-readable failures from the generation flow", async () => {
    const generateVideoFromPrompt = spyOn(
      promptToVideoModule,
      "generateVideoFromPrompt"
    );
    generateVideoFromPrompt.mockRejectedValueOnce(
      new AppError("GENERATION_ERROR", {
        details: ["schema mismatch"],
      })
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
