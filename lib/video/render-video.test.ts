import { afterEach, describe, expect, mock, test } from "bun:test";

import type {
  RenderOutputTarget,
  VideoDescription,
  VideoTimingMetrics,
} from "@/lib/types/video";

const sampleVideoDescription = {
  background: "#000000",
  fps: 60,
  height: 720,
  scenes: [
    {
      duration: 240,
      id: "scene1",
      nodes: {
        center: {
          children: ["square"],
          type: "center",
        },
        square: {
          cornerRadius: 20,
          fill: "#38bdf8",
          height: 180,
          opacity: 0,
          rotate: 0,
          type: "rect",
          width: 180,
        },
      },
      startFrame: 0,
      timeline: [
        {
          at: 1,
          dur: 0.8,
          ease: "ease-out",
          opacity: 1,
          target: "square",
        },
        {
          at: 2,
          dur: 1,
          ease: "ease-in-out",
          rotate: 360,
          target: "square",
        },
      ],
    },
  ],
  width: 1280,
} satisfies VideoDescription;

const localOutputTarget: RenderOutputTarget = {
  filePath: "/tmp/render.mp4",
  jobId: "job-local",
  publicUrl: "/renders/job-local.mp4",
};

const remoteOutputTarget: RenderOutputTarget = {
  filePath: "renders/job-remote.mp4",
  jobId: "job-remote",
  publicUrl: null,
};

const localTimings: VideoTimingMetrics = {
  encodeMs: 412,
  renderMs: 1287,
};

const renderVideoWithRustMock = mock(
  async (): Promise<VideoTimingMetrics> => localTimings
);

const renderVideoWithModalMock = mock(async () => ({
  codec: "h264_nvenc",
  filePath: "renders/job-remote.mp4",
  jobId: "job-remote",
  publicUrl: "https://cdn.example.com/renders/job-remote.mp4",
  timings: {
    encodeMs: 245,
    renderMs: 890,
  },
}));

const createRenderOutputTargetMock = mock(
  async (): Promise<RenderOutputTarget> => localOutputTarget
);

const createRemoteRenderOutputTargetMock = mock(
  (): RenderOutputTarget => remoteOutputTarget
);

const createCustomRenderOutputTargetMock = mock(
  (outputFilePath: string, jobId?: string): RenderOutputTarget => ({
    filePath: outputFilePath,
    jobId: jobId ?? "job-custom",
    publicUrl: null,
  })
);

mock.module("@/lib/video/render-rust", () => ({
  renderVideoWithRust: renderVideoWithRustMock,
}));

mock.module("@/lib/video/modal-render", () => ({
  renderVideoWithModal: renderVideoWithModalMock,
}));

mock.module("@/lib/video/storage", () => ({
  createCustomRenderOutputTarget: createCustomRenderOutputTargetMock,
  createRemoteRenderOutputTarget: createRemoteRenderOutputTargetMock,
  createRenderOutputTarget: createRenderOutputTargetMock,
}));

const { renderVideo } = await import("./render-video");

afterEach(() => {
  createCustomRenderOutputTargetMock.mockReset();
  createRemoteRenderOutputTargetMock.mockReset();
  createRenderOutputTargetMock.mockReset();
  renderVideoWithModalMock.mockReset();
  renderVideoWithRustMock.mockReset();
  process.env.MODAL_RENDER_CODEC = undefined;
  process.env.MODAL_RENDER_ENDPOINT = undefined;
  process.env.VIDEO_RENDER_CODEC = undefined;
  process.env.VIDEO_RENDER_MODE = undefined;
});

describe("renderVideo", () => {
  test("uses the local Rust renderer when local mode is configured", async () => {
    process.env.VIDEO_RENDER_CODEC = "libx264";
    process.env.VIDEO_RENDER_MODE = "local";
    createRenderOutputTargetMock.mockResolvedValueOnce(localOutputTarget);
    renderVideoWithRustMock.mockResolvedValueOnce(localTimings);

    const result = await renderVideo(sampleVideoDescription);

    expect(createRenderOutputTargetMock).toHaveBeenCalledTimes(1);
    expect(createRemoteRenderOutputTargetMock).not.toHaveBeenCalled();
    expect(renderVideoWithModalMock).not.toHaveBeenCalled();
    expect(renderVideoWithRustMock).toHaveBeenCalledWith(
      sampleVideoDescription,
      "/tmp/render.mp4",
      "libx264"
    );
    expect(result).toEqual({
      codec: "libx264",
      filePath: "/tmp/render.mp4",
      fps: 60,
      frameCount: 240,
      height: 720,
      jobId: "job-local",
      publicUrl: "/renders/job-local.mp4",
      timings: {
        encodeMs: 412,
        renderMs: 1287,
      },
      width: 1280,
    });
  });

  test("uses the Modal renderer when modal mode is configured", async () => {
    process.env.MODAL_RENDER_ENDPOINT = "https://modal.example.com/render";
    process.env.MODAL_RENDER_CODEC = "h264_nvenc";
    process.env.VIDEO_RENDER_MODE = "modal";
    createRemoteRenderOutputTargetMock.mockReturnValueOnce(remoteOutputTarget);
    renderVideoWithModalMock.mockResolvedValueOnce({
      codec: "h264_nvenc",
      filePath: "renders/job-remote.mp4",
      jobId: "job-remote",
      publicUrl: "https://cdn.example.com/renders/job-remote.mp4",
      timings: {
        encodeMs: 245,
        renderMs: 890,
      },
    });

    const result = await renderVideo(sampleVideoDescription);

    expect(createRemoteRenderOutputTargetMock).toHaveBeenCalledTimes(1);
    expect(createRenderOutputTargetMock).not.toHaveBeenCalled();
    expect(renderVideoWithRustMock).not.toHaveBeenCalled();
    expect(renderVideoWithModalMock).toHaveBeenCalledWith({
      codec: "h264_nvenc",
      jobId: "job-remote",
      objectKey: "renders/job-remote.mp4",
      scene: sampleVideoDescription,
    });
    expect(result).toEqual({
      codec: "h264_nvenc",
      filePath: "renders/job-remote.mp4",
      fps: 60,
      frameCount: 240,
      height: 720,
      jobId: "job-remote",
      publicUrl: "https://cdn.example.com/renders/job-remote.mp4",
      timings: {
        encodeMs: 245,
        renderMs: 890,
      },
      width: 1280,
    });
  });
});
