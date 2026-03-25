import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

import { AppError } from "@/lib/errors";
import type { PromptToVideoSceneResponse } from "@/lib/types/prompt-to-video";

const aiModule = await import("@/lib/actions/ai");
const { POST } = await import("@/app/api/generate-scene/route");

const sampleSceneResponse: PromptToVideoSceneResponse = {
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
};

const createRequest = (body: string): Request =>
  new Request("http://localhost/api/generate-scene", {
    body,
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

describe("POST /api/generate-scene", () => {
  afterEach(() => {
    mock.restore();
  });

  it("returns the generated scene response", async () => {
    const generateSceneJson = spyOn(aiModule, "generateSceneJson");
    generateSceneJson.mockResolvedValueOnce(sampleSceneResponse.scene);

    const response = await POST(
      createRequest(JSON.stringify({ prompt: "A modern launch trailer" }))
    );

    expect(response.status).toBe(200);
    expect(generateSceneJson).toHaveBeenCalledWith("A modern launch trailer");
    await expect(response.json()).resolves.toEqual(sampleSceneResponse);
  });

  it("returns a validation error when the request body is invalid JSON", async () => {
    const generateSceneJson = spyOn(aiModule, "generateSceneJson");
    const consoleError = spyOn(console, "error").mockImplementation(
      () => undefined
    );

    const response = await POST(createRequest("{"));

    expect(response.status).toBe(400);
    expect(generateSceneJson).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        details: ["Request body must be valid JSON."],
        message: "Prompt request validation failed.",
      },
    });
  });

  it("returns machine-readable failures from the generation flow", async () => {
    const generateSceneJson = spyOn(aiModule, "generateSceneJson");
    const consoleError = spyOn(console, "error").mockImplementation(
      () => undefined
    );
    generateSceneJson.mockRejectedValueOnce(
      new AppError("GENERATION_ERROR", {
        details: ["schema mismatch"],
      })
    );

    const response = await POST(
      createRequest(JSON.stringify({ prompt: "A photorealistic explosion" }))
    );

    expect(response.status).toBe(502);
    expect(consoleError).toHaveBeenCalledWith(
      "POST /api/generate-scene failed",
      {
        code: "GENERATION_ERROR",
        details: ["schema mismatch"],
        message: "AI scene generation failed.",
        status: 502,
      }
    );
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "GENERATION_ERROR",
        details: ["schema mismatch"],
        message: "AI scene generation failed.",
      },
    });
  });
});
