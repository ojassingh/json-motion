import { createValidationError } from "@/lib/errors";
import type {
  RenderedVideoResult,
  RenderVideoOptions,
  VideoDescription,
} from "@/lib/types/video";
import {
  getDefaultVideoCodec,
  getModalVideoCodec,
  getVideoRenderMode,
} from "@/lib/video/config";
import { renderVideoWithModal } from "@/lib/video/modal-render";
import { renderVideoWithRust } from "@/lib/video/render-rust";
import { videoDescriptionSchema } from "@/lib/video/schema";
import {
  createCustomRenderOutputTarget,
  createRemoteRenderOutputTarget,
  createRenderOutputTarget,
} from "@/lib/video/storage";
import { getTotalFrameCount } from "@/lib/video/timeline";

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
  const renderMode = getVideoRenderMode();
  const codec =
    options?.codec ??
    (renderMode === "modal" ? getModalVideoCodec() : getDefaultVideoCodec());

  if (renderMode === "modal") {
    const outputTarget = createRemoteRenderOutputTarget(options?.jobId);
    const remoteRender = await renderVideoWithModal({
      codec,
      jobId: outputTarget.jobId,
      objectKey: outputTarget.filePath,
      scene: videoDescription,
    });

    return {
      codec: remoteRender.codec,
      filePath: remoteRender.filePath,
      fps: videoDescription.fps,
      frameCount,
      height: videoDescription.height,
      jobId: remoteRender.jobId,
      publicUrl: remoteRender.publicUrl,
      timings: remoteRender.timings,
      width: videoDescription.width,
    };
  }

  const outputTarget = options?.outputFilePath
    ? createCustomRenderOutputTarget(options.outputFilePath, options.jobId)
    : await createRenderOutputTarget(options?.jobId);

  const timings = await renderVideoWithRust(
    videoDescription,
    outputTarget.filePath,
    codec
  );

  return {
    ...outputTarget,
    codec,
    fps: videoDescription.fps,
    frameCount,
    height: videoDescription.height,
    timings,
    width: videoDescription.width,
  };
};
