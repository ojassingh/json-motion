import { describe, expect, it } from "bun:test";
import { PromptToVideoError } from "@/lib/prompt-to-video/errors";
import {
  createPromptToVideoService,
  type PromptToVideoServiceDependencies,
} from "@/lib/prompt-to-video/service";
import type { RenderedVideoResult, VideoDescription } from "@/lib/types/video";
import { VideoRenderError } from "@/lib/video/errors";

const sampleVideoDescription: VideoDescription = {
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
        {
          color: "#f8fafc",
          fontSize: 46,
          id: "headline",
          text: "Prompt to video",
          transform: {
            x: 144,
            y: 192,
          },
          type: "text",
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

const createDependencies = (): PromptToVideoServiceDependencies => ({
  generateVideoDescriptionFromPrompt: async () => sampleVideoDescription,
  renderVideo: async () => sampleRenderResult,
});

describe("createPromptToVideoService", () => {
  it("rejects blank prompts before generation starts", async () => {
    const generateVideo = createPromptToVideoService(createDependencies());

    await expect(generateVideo({ prompt: "   " })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
    });
  });

  it("returns the generated scene and render metadata on success", async () => {
    const generateVideo = createPromptToVideoService(createDependencies());

    await expect(
      generateVideo({ prompt: "A cinematic launch announcement" })
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

  it("normalizes model generation failures", async () => {
    const generateVideo = createPromptToVideoService({
      ...createDependencies(),
      generateVideoDescriptionFromPrompt: () =>
        Promise.reject(new Error("schema mismatch")),
    });

    await expect(
      generateVideo({ prompt: "An impossible prompt" })
    ).rejects.toMatchObject({
      code: "GENERATION_ERROR",
      details: ["schema mismatch"],
      status: 502,
    });
  });

  it("passes through configuration errors from the model layer", async () => {
    const generateVideo = createPromptToVideoService({
      ...createDependencies(),
      generateVideoDescriptionFromPrompt: () =>
        Promise.reject(
          new PromptToVideoError(
            "CONFIGURATION_ERROR",
            "Missing AI_GATEWAY_API_KEY.",
            {
              details: [
                "Set AI_GATEWAY_API_KEY before calling /api/generate-video.",
              ],
              status: 500,
            }
          )
        ),
    });

    await expect(
      generateVideo({ prompt: "A polished intro slate" })
    ).rejects.toMatchObject({
      code: "CONFIGURATION_ERROR",
      status: 500,
    });
  });

  it("normalizes render failures after generation succeeds", async () => {
    const generateVideo = createPromptToVideoService({
      ...createDependencies(),
      renderVideo: () =>
        Promise.reject(
          new VideoRenderError("ENCODER_ERROR", "ffmpeg exited unexpectedly.", {
            details: ["spawn ffmpeg ENOENT"],
            status: 500,
          })
        ),
    });

    await expect(
      generateVideo({ prompt: "A product reveal animation" })
    ).rejects.toMatchObject({
      code: "RENDER_ERROR",
      details: ["spawn ffmpeg ENOENT"],
      status: 500,
    });
  });
});
