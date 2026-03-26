import type { VideoNode, VideoScene } from "@/lib/types/video";

export const flattenVideoNodes = (nodes: VideoNode[]): VideoNode[] => {
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

export const flattenSceneNodes = (scenes: VideoScene[]): VideoNode[] =>
  scenes.flatMap((scene) => flattenVideoNodes(scene.nodes));
