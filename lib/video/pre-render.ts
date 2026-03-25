import type { Image } from "skia-canvas";

import type {
  VideoDescription,
  VideoImageNode,
  VideoNode,
} from "@/lib/types/video";
import { loadVideoImage } from "@/lib/video/assets";
import { type Point2D, preSampleGraphNodes } from "@/lib/video/graph";
import { preRenderMathNodes } from "@/lib/video/math";
import { collectVisualWarnings } from "@/lib/video/visual-validation";

export interface PreRenderCaches {
  graphPoints: Map<string, Point2D[]>;
  mathImages: Map<string, Image>;
}

const flattenNodes = (nodes: VideoNode[]): VideoNode[] => {
  const result: VideoNode[] = [];
  const stack = [...nodes];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    result.push(node);
    if (
      node.type === "group" ||
      node.type === "center" ||
      node.type === "stack" ||
      node.type === "align"
    ) {
      stack.push(...node.children);
    }
  }

  return result;
};

const preloadImageAssets = async (
  videoDescription: VideoDescription
): Promise<void> => {
  const allNodes = videoDescription.scenes.flatMap((scene) =>
    flattenNodes(scene.nodes)
  );
  const imageNodes = allNodes.filter(
    (node): node is VideoImageNode => node.type === "image"
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
