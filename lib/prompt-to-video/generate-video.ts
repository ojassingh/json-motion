import { generateVideoDescriptionFromPrompt } from "@/lib/ai/generate-video-description";
import { createPromptToVideoService } from "@/lib/prompt-to-video/service";
import { renderVideo } from "@/lib/video/service";

export const generateVideoFromPrompt = createPromptToVideoService({
  generateVideoDescriptionFromPrompt,
  renderVideo,
});
