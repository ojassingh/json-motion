import { generateSceneJson } from "@/lib/actions/ai";
import { createValidationError } from "@/lib/errors";
import type {
  PromptToVideoRequest,
  PromptToVideoSuccessResponse,
} from "@/lib/types/prompt-to-video";
import { promptToVideoRequestSchema } from "@/lib/types/prompt-to-video";
import type { RenderedVideoResult, VideoDescription } from "@/lib/types/video";
import { renderVideo } from "@/lib/video/render-video";

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

export const generateVideoFromPrompt = async (
  input: Partial<PromptToVideoRequest>
): Promise<PromptToVideoSuccessResponse> => {
  const parsedRequest = promptToVideoRequestSchema.safeParse(input);

  if (!parsedRequest.success) {
    throw createValidationError(
      "Prompt request validation failed.",
      parsedRequest.error.issues.map((issue) => issue.message)
    );
  }

  const scene = await generateSceneJson(parsedRequest.data.prompt);
  const renderResult = await renderVideo(scene);

  return toPromptToVideoSuccessResponse(scene, renderResult);
};
