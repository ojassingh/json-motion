import { afterEach, describe, expect, mock, test } from "bun:test";

import { createValidationError } from "@/lib/errors";
import type { RenderedVideoResult, VideoDescription } from "@/lib/types/video";

const sampleRequestBody = {
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

const renderResult: RenderedVideoResult = {
  codec: "libx264",
  filePath: "/tmp/render.mp4",
  fps: 60,
  frameCount: 240,
  height: 720,
  jobId: "job-123",
  publicUrl: "/renders/job-123.mp4",
  timings: {
    encodeMs: 412,
    renderMs: 1287,
  },
  width: 1280,
};

const renderVideoMock = mock(
  async (_input: VideoDescription): Promise<RenderedVideoResult> => renderResult
);

mock.module("@/lib/video/render-video", () => ({
  renderVideo: renderVideoMock,
}));

const { POST } = await import("./route");

const createRenderRequest = (body: BodyInit): Request =>
  new Request("http://localhost/api/render", {
    body,
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

afterEach(() => {
  renderVideoMock.mockReset();
});

describe("POST /api/render", () => {
  test("returns render metadata for a valid request", async () => {
    renderVideoMock.mockResolvedValueOnce(renderResult);

    const response = await POST(
      createRenderRequest(JSON.stringify(sampleRequestBody))
    );
    const responseBody = await response.json();

    expect(response.status).toBe(200);
    expect(renderVideoMock).toHaveBeenCalledTimes(1);
    expect(renderVideoMock).toHaveBeenCalledWith(sampleRequestBody);
    expect(responseBody).toEqual({
      codec: "libx264",
      filePath: "/tmp/render.mp4",
      fps: 60,
      frameCount: 240,
      jobId: "job-123",
      timings: {
        encodeMs: 412,
        renderMs: 1287,
      },
      url: "/renders/job-123.mp4",
    });
  });

  test("returns a validation error for malformed JSON", async () => {
    const response = await POST(createRenderRequest("{"));
    const responseBody = await response.json();

    expect(response.status).toBe(400);
    expect(renderVideoMock).not.toHaveBeenCalled();
    expect(responseBody).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        details: ["Request body must be valid JSON."],
        message: "Render request validation failed.",
      },
    });
  });

  test("returns renderer app errors with their status and payload", async () => {
    renderVideoMock.mockRejectedValueOnce(
      createValidationError("Render request validation failed.", [
        "Colors must use hex notation.",
      ])
    );

    const response = await POST(
      createRenderRequest(JSON.stringify(sampleRequestBody))
    );
    const responseBody = await response.json();

    expect(response.status).toBe(400);
    expect(renderVideoMock).toHaveBeenCalledTimes(1);
    expect(responseBody).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        details: ["Colors must use hex notation."],
        message: "Render request validation failed.",
      },
    });
  });
});
