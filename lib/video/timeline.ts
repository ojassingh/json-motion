import type { VideoDescription, VideoScene } from "@/lib/types/video";

export const getSceneEndFrame = (scene: VideoScene): number =>
  scene.startFrame + scene.duration - 1;

export const getTotalFrameCount = (
  videoDescription: VideoDescription
): number =>
  videoDescription.scenes.reduce(
    (largestFrameCount, scene) =>
      Math.max(largestFrameCount, getSceneEndFrame(scene) + 1),
    0
  );

export const getSceneForFrame = (
  videoDescription: VideoDescription,
  absoluteFrame: number
): VideoScene | null => {
  for (const scene of videoDescription.scenes) {
    if (
      absoluteFrame >= scene.startFrame &&
      absoluteFrame <= getSceneEndFrame(scene)
    ) {
      return scene;
    }
  }

  return null;
};

export const getSceneLocalFrame = (
  scene: VideoScene,
  absoluteFrame: number
): number => absoluteFrame - scene.startFrame;
