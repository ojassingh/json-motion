import type { VideoNode, VideoScene } from "@/lib/types/video";

export const flattenVideoNodes = (
  nodes: Record<string, VideoNode>
): Array<VideoNode & { id: string }> =>
  Object.entries(nodes).map(([id, node]) => ({ ...node, id }));

export const flattenSceneNodes = (
  scenes: VideoScene[]
): Array<VideoNode & { id: string }> =>
  scenes.flatMap((scene) => flattenVideoNodes(scene.nodes));
