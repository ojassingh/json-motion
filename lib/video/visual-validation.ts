import type { VideoDescription, VideoNode } from "@/lib/types/video";

export interface VisualWarning {
  message: string;
  nodeId: string;
  severity: "warn";
}

type DimensionedNode = Extract<
  VideoNode,
  { type: "functionGraph" | "image" | "math" | "parametricGraph" | "rect" }
>;

const isDimensionedNode = (node: VideoNode): node is DimensionedNode =>
  node.type === "rect" ||
  node.type === "image" ||
  node.type === "math" ||
  node.type === "functionGraph" ||
  node.type === "parametricGraph";

const checkOffScreen = (
  id: string,
  node: DimensionedNode,
  frameWidth: number,
  frameHeight: number
): VisualWarning | null => {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const w = node.width ?? 0;
  const h = node.height ?? 0;
  const right = x + w;
  const bottom = y + h;

  if (right > 0 && bottom > 0 && x < frameWidth && y < frameHeight) {
    return null;
  }

  return {
    message: `Node "${id}" is entirely off-screen at initial position (${x}, ${y}).`,
    nodeId: id,
    severity: "warn",
  };
};

export const collectVisualWarnings = (
  videoDescription: VideoDescription
): VisualWarning[] => {
  const { height, width } = videoDescription;
  const warnings: VisualWarning[] = [];

  for (const scene of videoDescription.scenes) {
    for (const [id, node] of Object.entries(scene.nodes)) {
      if (isDimensionedNode(node)) {
        const w = checkOffScreen(id, node, width, height);
        if (w) {
          warnings.push(w);
        }
      }
    }
  }

  return warnings;
};
