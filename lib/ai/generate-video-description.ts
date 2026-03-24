import { gateway, generateText, Output } from "ai";

import {
  buildPromptToVideoUserPrompt,
  PROMPT_TO_VIDEO_MODEL,
  PROMPT_TO_VIDEO_PROVIDER_API_KEY_ENV_VAR,
  PROMPT_TO_VIDEO_SYSTEM_PROMPT,
} from "@/lib/ai/prompt-to-video-config";
import { AppError, toAppError } from "@/lib/errors";
import type { VideoDescription } from "@/lib/types/video";
import { videoDescriptionSchema } from "@/lib/video/schema";

export const generateVideoDescriptionFromPrompt = async (
  prompt: string
): Promise<VideoDescription> => {
  if (!process.env[PROMPT_TO_VIDEO_PROVIDER_API_KEY_ENV_VAR]?.trim()) {
    throw new AppError("CONFIGURATION_ERROR", {
      details: [
        `Set ${PROMPT_TO_VIDEO_PROVIDER_API_KEY_ENV_VAR} before calling /api/generate-video.`,
      ],
      message: `Missing ${PROMPT_TO_VIDEO_PROVIDER_API_KEY_ENV_VAR}.`,
    });
  }

  try {
    const { output } = await generateText({
      model: gateway(PROMPT_TO_VIDEO_MODEL),
      output: Output.object({
        schema: videoDescriptionSchema,
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
