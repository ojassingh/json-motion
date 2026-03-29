import { z } from "zod";

import type { AppErrorResponse } from "@/lib/errors";
import type {
  VideoAiOutput,
  VideoDescription,
  VideoTimingMetrics,
} from "@/lib/types/video";

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

export interface PromptToVideoSceneResponse {
  rawOutput: VideoAiOutput;
  scene: VideoDescription;
  timings: {
    inferenceMs: number;
  };
}

export interface PromptToVideoRenderMetadata {
  codec: string;
  fps: number;
  frameCount: number;
  height: number;
  jobId: string;
  timings: VideoTimingMetrics;
  url: string | null;
  width: number;
}

export interface PromptToVideoSuccessResponse {
  rawOutput: VideoAiOutput;
  scene: VideoDescription;
  timings: {
    inferenceMs: number;
  };
  video: PromptToVideoRenderMetadata;
}

export interface RenderVideoResponse {
  codec: string;
  filePath: string;
  fps: number;
  frameCount: number;
  jobId: string;
  timings: VideoTimingMetrics;
  url: string | null;
}

export type PromptToSceneResponse =
  | AppErrorResponse
  | PromptToVideoSceneResponse;
export type PromptToVideoResponse =
  | AppErrorResponse
  | PromptToVideoSuccessResponse;
