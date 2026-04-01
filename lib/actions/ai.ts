import { gateway, generateText, Output } from "ai";

import {
  buildPromptToVideoUserPrompt,
  PROMPT_TO_VIDEO_MODEL,
  PROMPT_TO_VIDEO_SYSTEM_PROMPT,
  videoCatalog,
} from "@/lib/ai/prompt-to-video-config";
import { AppError, toAppError } from "@/lib/errors";
import type { VideoAiOutput, VideoDescription } from "@/lib/types/video";
import {
  DEFAULT_CANVAS_FPS,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_CANVAS_WIDTH,
} from "@/lib/video/config";
import { resolveAiSceneNodes } from "@/lib/video/lucide";
import { expandAiSceneMacros } from "@/lib/video/macros";
import { videoDescriptionSchema } from "@/lib/video/schema";

export const convertAiOutputToVideoDescription = async (
  aiOutput: VideoAiOutput
): Promise<VideoDescription> => {
  let startFrame = 0;

  const scenes = await Promise.all(
    aiOutput.scenes.map(async (scene) => {
      const expandedScene = expandAiSceneMacros(scene);
      const duration = Math.max(
        1,
        Math.round(expandedScene.duration * DEFAULT_CANVAS_FPS)
      );
      const nodes = await resolveAiSceneNodes(expandedScene.nodes);
      const converted = { ...expandedScene, duration, nodes, startFrame };
      startFrame += duration;
      return converted;
    })
  );

  return videoDescriptionSchema.parse({
    ...aiOutput,
    fps: DEFAULT_CANVAS_FPS,
    height: DEFAULT_CANVAS_HEIGHT,
    scenes,
    width: DEFAULT_CANVAS_WIDTH,
  });
};

export const generateSceneJson = async (
  prompt: string
): Promise<{
  rawOutput: VideoAiOutput;
  scene: VideoDescription;
  timings: {
    inferenceMs: number;
  };
}> => {
  const apiKey = process.env.AI_GATEWAY_API_KEY;

  if (!apiKey) {
    throw new AppError("CONFIGURATION_ERROR", {
      details: ["Set AI_GATEWAY_API_KEY before calling /api/generate-video."],
      message: "Missing AI_GATEWAY_API_KEY.",
    });
  }

  try {
    const inferenceStart = performance.now();
    const { output } = await generateText({
      model: gateway(PROMPT_TO_VIDEO_MODEL),
      output: Output.object({
        schema: videoCatalog.getSchema(),
      }),
      prompt: buildPromptToVideoUserPrompt(prompt),
      providerOptions: {
        openai: {
          strictJsonSchema: false,
        },
      },
      system: PROMPT_TO_VIDEO_SYSTEM_PROMPT,
    });
    const inferenceMs = performance.now() - inferenceStart;

    console.log("[ai] raw output:", JSON.stringify(output, null, 2));

    const parsed = videoCatalog.getSchema().parse(output);
    const description = await convertAiOutputToVideoDescription(parsed);

    console.log(
      "[ai] video description:",
      JSON.stringify(description, null, 2)
    );

    return {
      rawOutput: parsed,
      scene: description,
      timings: {
        inferenceMs,
      },
    };
  } catch (error) {
    throw toAppError(error, "GENERATION_ERROR", {
      message: "AI scene generation failed.",
    });
  }
};
