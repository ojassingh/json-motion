import { z } from "zod";

import type { AppErrorResponse } from "@/lib/errors";
import type { VideoDescription } from "@/lib/types/video";

export const MAX_PROMPT_LENGTH = 600;

export const promptToVideoRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, "Enter a prompt to generate a video.")
    .max(
      MAX_PROMPT_LENGTH,
      `Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.`
    ),
});

export type PromptToVideoRequest = z.infer<typeof promptToVideoRequestSchema>;

export interface PromptToVideoRenderMetadata {
  codec: string;
  fps: number;
  frameCount: number;
  height: number;
  jobId: string;
  url: string | null;
  width: number;
}

export interface PromptToVideoSuccessResponse {
  scene: VideoDescription;
  video: PromptToVideoRenderMetadata;
}

export type PromptToVideoResponse =
  | AppErrorResponse
  | PromptToVideoSuccessResponse;
