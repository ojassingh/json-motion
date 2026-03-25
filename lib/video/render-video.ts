import { createValidationError } from "@/lib/errors";
import type {
  RenderedVideoResult,
  RenderVideoOptions,
  VideoDescription,
} from "@/lib/types/video";
import { getDefaultVideoCodec } from "@/lib/video/config";
import { encodeVideoFrames } from "@/lib/video/encoder";
import { type PreRenderCaches, preRenderVideo } from "@/lib/video/pre-render";
import { renderFrameToRgba } from "@/lib/video/renderer";
import { videoDescriptionSchema } from "@/lib/video/schema";
import {
  createCustomRenderOutputTarget,
  createRenderOutputTarget,
} from "@/lib/video/storage";
import { getTotalFrameCount } from "@/lib/video/timeline";

const createFrameStream = async function* (
  videoDescription: VideoDescription,
  caches: PreRenderCaches
): AsyncGenerator<Buffer> {
  const frameCount = getTotalFrameCount(videoDescription);

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    yield await renderFrameToRgba(videoDescription, frameIndex, caches);
  }
};

export const renderVideo = async (
  input: VideoDescription,
  options?: RenderVideoOptions
): Promise<RenderedVideoResult> => {
  const parsedVideoDescription = videoDescriptionSchema.safeParse(input);

  if (!parsedVideoDescription.success) {
    throw createValidationError(
      "Render request validation failed.",
      parsedVideoDescription.error.issues.map((issue) => issue.message)
    );
  }

  const videoDescription = parsedVideoDescription.data;
  const frameCount = getTotalFrameCount(videoDescription);
  const codec = options?.codec ?? getDefaultVideoCodec();
  const outputTarget = options?.outputFilePath
    ? createCustomRenderOutputTarget(options.outputFilePath, options.jobId)
    : await createRenderOutputTarget(options?.jobId);

  const caches = await preRenderVideo(videoDescription);

  await encodeVideoFrames(
    videoDescription,
    codec,
    outputTarget.filePath,
    createFrameStream(videoDescription, caches)
  );

  return {
    ...outputTarget,
    codec,
    fps: videoDescription.fps,
    frameCount,
    height: videoDescription.height,
    width: videoDescription.width,
  };
};
