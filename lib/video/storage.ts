import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { RenderOutputTarget } from "@/lib/types/video";
import {
  PUBLIC_RENDER_DIRECTORY_PATH,
  PUBLIC_RENDER_URL_PREFIX,
} from "@/lib/video/config";
import { VideoRenderError } from "@/lib/video/errors";

export const ensureRenderDirectory = async (): Promise<void> => {
  await mkdir(PUBLIC_RENDER_DIRECTORY_PATH, { recursive: true });
};

export const createRenderOutputTarget = async (
  jobId?: string
): Promise<RenderOutputTarget> => {
  const resolvedJobId = jobId ?? randomUUID();

  try {
    await ensureRenderDirectory();
  } catch (error) {
    if (error instanceof Error) {
      throw new VideoRenderError(
        "STORAGE_ERROR",
        "Unable to prepare the local render directory.",
        { cause: error }
      );
    }

    throw new VideoRenderError(
      "STORAGE_ERROR",
      "Unable to prepare the local render directory."
    );
  }

  return {
    filePath: path.join(PUBLIC_RENDER_DIRECTORY_PATH, `${resolvedJobId}.mp4`),
    jobId: resolvedJobId,
    publicUrl: `${PUBLIC_RENDER_URL_PREFIX}/${resolvedJobId}.mp4`,
  };
};

export const createCustomRenderOutputTarget = (
  outputFilePath: string,
  jobId?: string
): RenderOutputTarget => ({
  filePath: outputFilePath,
  jobId: jobId ?? randomUUID(),
  publicUrl: null,
});
