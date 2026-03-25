import type {
  VideoDescription,
  VideoNode,
  VideoScene,
} from "@/lib/types/video";

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

const getAnchorOffsetFactors = (
  anchor: string
): { xFactor: number; yFactor: number } => {
  if (anchor === "top-left") {
    return { xFactor: 0, yFactor: 0 };
  }
  if (anchor === "top-center") {
    return { xFactor: 0.5, yFactor: 0 };
  }
  if (anchor === "top-right") {
    return { xFactor: 1, yFactor: 0 };
  }
  if (anchor === "center-left") {
    return { xFactor: 0, yFactor: 0.5 };
  }
  if (anchor === "center") {
    return { xFactor: 0.5, yFactor: 0.5 };
  }
  if (anchor === "center-right") {
    return { xFactor: 1, yFactor: 0.5 };
  }
  if (anchor === "bottom-left") {
    return { xFactor: 0, yFactor: 1 };
  }
  if (anchor === "bottom-center") {
    return { xFactor: 0.5, yFactor: 1 };
  }
  return { xFactor: 1, yFactor: 1 };
};

const checkOffScreen = (
  node: DimensionedNode,
  frameWidth: number,
  frameHeight: number
): VisualWarning | null => {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const anchor = node.anchor ?? "center";
  const { xFactor, yFactor } = getAnchorOffsetFactors(anchor);

  const left = x - xFactor * node.width;
  const top = y - yFactor * node.height;
  const right = left + node.width;
  const bottom = top + node.height;

  if (right > 0 && bottom > 0 && left < frameWidth && top < frameHeight) {
    return null;
  }

  return {
    message: `Node "${node.id}" is entirely off-screen at initial position (${x}, ${y}).`,
    nodeId: node.id,
    severity: "warn",
  };
};

const collectNodeWarnings = (
  node: VideoNode,
  scene: VideoScene,
  frameWidth: number,
  frameHeight: number
): VisualWarning[] => {
  const warnings: VisualWarning[] = [];

  if (isDimensionedNode(node)) {
    const offScreen = checkOffScreen(node, frameWidth, frameHeight);
    if (offScreen) {
      warnings.push(offScreen);
    }
  }

  if (
    node.type === "group" ||
    node.type === "center" ||
    node.type === "stack" ||
    node.type === "align"
  ) {
    for (const child of node.children) {
      warnings.push(
        ...collectNodeWarnings(child, scene, frameWidth, frameHeight)
      );
    }
  }

  return warnings;
};

export const collectVisualWarnings = (
  videoDescription: VideoDescription
): VisualWarning[] => {
  const { height, width } = videoDescription;
  const warnings: VisualWarning[] = [];

  for (const scene of videoDescription.scenes) {
    for (const node of scene.nodes) {
      warnings.push(...collectNodeWarnings(node, scene, width, height));
    }
  }

  return warnings;
};
