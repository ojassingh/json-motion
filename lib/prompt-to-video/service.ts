import {
  createPromptValidationError,
  PromptToVideoError,
} from "@/lib/prompt-to-video/errors";
import type {
  PromptToVideoRequest,
  PromptToVideoSuccessResponse,
} from "@/lib/types/prompt-to-video";
import { promptToVideoRequestSchema } from "@/lib/types/prompt-to-video";
import type { RenderedVideoResult, VideoDescription } from "@/lib/types/video";
import { VideoRenderError } from "@/lib/video/errors";

export interface PromptToVideoServiceDependencies {
  generateVideoDescriptionFromPrompt: (
    prompt: string
  ) => Promise<VideoDescription>;
  renderVideo: (
    videoDescription: VideoDescription
  ) => Promise<RenderedVideoResult>;
}

export type PromptToVideoServiceInput = Partial<PromptToVideoRequest>;

const toPromptToVideoSuccessResponse = (
  scene: VideoDescription,
  renderResult: RenderedVideoResult
): PromptToVideoSuccessResponse => ({
  scene,
  video: {
    codec: renderResult.codec,
    fps: renderResult.fps,
    frameCount: renderResult.frameCount,
    height: renderResult.height,
    jobId: renderResult.jobId,
    url: renderResult.publicUrl,
    width: renderResult.width,
  },
});

const toPromptToVideoRenderError = (
  error: Error | VideoRenderError
): PromptToVideoError => {
  if (error instanceof VideoRenderError) {
    return new PromptToVideoError("RENDER_ERROR", error.message, {
      cause: error,
      details: error.details,
      status: error.status,
    });
  }

  return new PromptToVideoError("RENDER_ERROR", "Video rendering failed.", {
    cause: error,
    details: [error.message],
    status: 500,
  });
};

export const createPromptToVideoService = (
  dependencies: PromptToVideoServiceDependencies
) => {
  return async (
    input: PromptToVideoServiceInput
  ): Promise<PromptToVideoSuccessResponse> => {
    const parsedRequest = promptToVideoRequestSchema.safeParse(input);

    if (!parsedRequest.success) {
      throw createPromptValidationError(
        parsedRequest.error.issues.map((issue) => issue.message)
      );
    }

    const { prompt } = parsedRequest.data;

    let scene: VideoDescription;

    try {
      scene = await dependencies.generateVideoDescriptionFromPrompt(prompt);
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

    try {
      const renderResult = await dependencies.renderVideo(scene);

      return toPromptToVideoSuccessResponse(scene, renderResult);
    } catch (error) {
      if (error instanceof Error) {
        throw toPromptToVideoRenderError(error);
      }

      throw new PromptToVideoError("RENDER_ERROR", "Video rendering failed.", {
        status: 500,
      });
    }
  };
};
