import "server-only";

import { generateVideoDescriptionFromPrompt as generateVideoDescriptionFromPromptCore } from "@/lib/ai/generate-video-description-core";

export const generateVideoDescriptionFromPrompt = async (prompt: string) =>
  generateVideoDescriptionFromPromptCore(prompt);
