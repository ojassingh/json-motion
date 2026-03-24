import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { toAppError } from "@/lib/errors";
import type { RenderOutputTarget } from "@/lib/types/video";
import {
  PUBLIC_RENDER_DIRECTORY_PATH,
  PUBLIC_RENDER_URL_PREFIX,
} from "@/lib/video/config";

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
    throw toAppError(error, "STORAGE_ERROR", {
      message: "Unable to prepare the local render directory.",
    });
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
