import { gateway, generateText, Output } from "ai";
import {
  buildPromptToVideoUserPrompt,
  PROMPT_TO_VIDEO_MODEL,
  PROMPT_TO_VIDEO_SYSTEM_PROMPT,
  videoCatalog,
} from "@/lib/ai/prompt-to-video-config";
import { AppError, toAppError } from "@/lib/errors";
import type { VideoDescription } from "@/lib/types/video";

export const generateSceneJson = async (
  prompt: string
): Promise<VideoDescription> => {
  const apiKey = process.env.AI_GATEWAY_API_KEY;

  if (!apiKey) {
    throw new AppError("CONFIGURATION_ERROR", {
      details: ["Set AI_GATEWAY_API_KEY before calling /api/generate-video."],
      message: "Missing AI_GATEWAY_API_KEY.",
    });
  }

  try {
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

    return output;
  } catch (error) {
    throw toAppError(error, "GENERATION_ERROR", {
      message: "AI scene generation failed.",
    });
  }
};
