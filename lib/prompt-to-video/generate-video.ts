import { generateSceneJson } from "@/lib/actions/ai";
import { createValidationError } from "@/lib/errors";
import type {
  PromptToVideoRequest,
  PromptToVideoSuccessResponse,
} from "@/lib/types/prompt-to-video";
import { promptToVideoRequestSchema } from "@/lib/types/prompt-to-video";
import type { RenderedVideoResult } from "@/lib/types/video";
import { renderVideo } from "@/lib/video/render-video";

const toPromptToVideoSuccessResponse = (
  generationResult: Awaited<ReturnType<typeof generateSceneJson>>,
  renderResult: RenderedVideoResult
): PromptToVideoSuccessResponse => ({
  rawOutput: generationResult.rawOutput,
  scene: generationResult.scene,
  timings: generationResult.timings,
  video: {
    codec: renderResult.codec,
    fps: renderResult.fps,
    frameCount: renderResult.frameCount,
    height: renderResult.height,
    jobId: renderResult.jobId,
    timings: renderResult.timings,
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

  const generationResult = await generateSceneJson(parsedRequest.data.prompt);
  const renderResult = await renderVideo(generationResult.scene);

  return toPromptToVideoSuccessResponse(generationResult, renderResult);
};
