import type { Image } from "skia-canvas";

import type { VideoDescription, VideoImageNode } from "@/lib/types/video";
import { loadVideoImage } from "@/lib/video/assets";
import { type Point2D, preSampleGraphNodes } from "@/lib/video/graph";
import { preRenderMathNodes } from "@/lib/video/math";
import { flattenSceneNodes } from "@/lib/video/nodes";
import { collectVisualWarnings } from "@/lib/video/visual-validation";

export interface PreRenderCaches {
  graphPoints: Map<string, Point2D[]>;
  mathImages: Map<string, Image>;
}

const preloadImageAssets = async (
  videoDescription: VideoDescription
): Promise<void> => {
  const imageNodes = flattenSceneNodes(videoDescription.scenes).filter(
    (node): node is VideoImageNode & { id: string } => node.type === "image"
  );

  await Promise.all(imageNodes.map((node) => loadVideoImage(node.src)));
};

export const preRenderVideo = async (
  videoDescription: VideoDescription
): Promise<PreRenderCaches> => {
  const warnings = collectVisualWarnings(videoDescription);

  for (const warning of warnings) {
    console.warn(`[visual-validation] ${warning.message}`);
  }

  await preloadImageAssets(videoDescription);
  const mathImages = await preRenderMathNodes(videoDescription.scenes);
  const graphPoints = preSampleGraphNodes(videoDescription.scenes);

  return { graphPoints, mathImages };
};
