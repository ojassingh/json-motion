import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

import { AppError } from "@/lib/errors";
import type { RenderedVideoResult, VideoDescription } from "@/lib/types/video";

const aiModule = await import("@/lib/actions/ai");
const promptToVideoModule = await import(
  "@/lib/prompt-to-video/generate-video"
);
const renderVideoModule = await import("@/lib/video/render-video");

const sampleVideoDescription: VideoDescription = {
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
        {
          color: "#f8fafc",
          id: "headline",
          size: 46,
          text: "Prompt to video",
          type: "text",
          x: 144,
          y: 192,
        },
      ],
      startFrame: 0,
    },
  ],
  width: 960,
};

const sampleRenderResult: RenderedVideoResult = {
  codec: "h264",
  filePath: "/tmp/prompt-to-video.mp4",
  fps: 12,
  frameCount: 72,
  height: 540,
  jobId: "job-123",
  publicUrl: "/renders/job-123.mp4",
  width: 960,
};

describe("generateVideoFromPrompt", () => {
  afterEach(() => {
    mock.restore();
  });

  it("rejects blank prompts before generation starts", async () => {
    const generateSceneJson = spyOn(aiModule, "generateSceneJson");

    await expect(
      promptToVideoModule.generateVideoFromPrompt({ prompt: "   " })
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
    });
    expect(generateSceneJson).not.toHaveBeenCalled();
  });

  it("returns the generated scene and render metadata on success", async () => {
    spyOn(aiModule, "generateSceneJson").mockResolvedValueOnce(
      sampleVideoDescription
    );
    spyOn(renderVideoModule, "renderVideo").mockResolvedValueOnce(
      sampleRenderResult
    );

    await expect(
      promptToVideoModule.generateVideoFromPrompt({
        prompt: "A cinematic launch announcement",
      })
    ).resolves.toEqual({
      scene: sampleVideoDescription,
      video: {
        codec: "h264",
        fps: 12,
        frameCount: 72,
        height: 540,
        jobId: "job-123",
        url: "/renders/job-123.mp4",
        width: 960,
      },
    });
  });

  it("passes through configuration errors from the model layer", async () => {
    spyOn(aiModule, "generateSceneJson").mockRejectedValueOnce(
      new AppError("CONFIGURATION_ERROR", {
        details: ["Set AI_GATEWAY_API_KEY before calling /api/generate-video."],
        message: "Missing AI_GATEWAY_API_KEY.",
      })
    );

    await expect(
      promptToVideoModule.generateVideoFromPrompt({
        prompt: "A polished intro slate",
      })
    ).rejects.toMatchObject({
      code: "CONFIGURATION_ERROR",
      status: 500,
    });
  });

  it("passes through render failures after generation succeeds", async () => {
    spyOn(aiModule, "generateSceneJson").mockResolvedValueOnce(
      sampleVideoDescription
    );
    spyOn(renderVideoModule, "renderVideo").mockRejectedValueOnce(
      new AppError("ENCODER_ERROR", {
        details: ["spawn ffmpeg ENOENT"],
        message: "ffmpeg exited unexpectedly.",
      })
    );

    await expect(
      promptToVideoModule.generateVideoFromPrompt({
        prompt: "A product reveal animation",
      })
    ).rejects.toMatchObject({
      code: "ENCODER_ERROR",
      details: ["spawn ffmpeg ENOENT"],
      status: 500,
    });
  });
});
