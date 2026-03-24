import { gateway, generateText, Output } from "ai";

import {
  buildPromptToVideoUserPrompt,
  PROMPT_TO_VIDEO_MODEL,
  PROMPT_TO_VIDEO_PROVIDER_API_KEY_ENV_VAR,
  PROMPT_TO_VIDEO_SYSTEM_PROMPT,
} from "@/lib/ai/prompt-to-video-config";
import { PromptToVideoError } from "@/lib/prompt-to-video/errors";
import type { VideoDescription } from "@/lib/types/video";
import { videoDescriptionSchema } from "@/lib/video/schema";

export const generateVideoDescriptionFromPrompt = async (
  prompt: string
): Promise<VideoDescription> => {
  if (!process.env[PROMPT_TO_VIDEO_PROVIDER_API_KEY_ENV_VAR]?.trim()) {
    throw new PromptToVideoError(
      "CONFIGURATION_ERROR",
      `Missing ${PROMPT_TO_VIDEO_PROVIDER_API_KEY_ENV_VAR}.`,
      {
        details: [
          `Set ${PROMPT_TO_VIDEO_PROVIDER_API_KEY_ENV_VAR} before calling /api/generate-video.`,
        ],
        status: 500,
      }
    );
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
    if (error instanceof PromptToVideoError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new PromptToVideoError(
        "GENERATION_ERROR",
        "AI scene generation failed.",
        {
          cause: error,
          details: [error.message],
          status: 502,
        }
      );
    }

    throw new PromptToVideoError(
      "GENERATION_ERROR",
      "AI scene generation failed.",
      {
        status: 502,
      }
    );
  }
};
