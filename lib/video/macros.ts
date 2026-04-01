import type {
  ExpandedVideoAiScene,
  VideoAiNode,
  VideoAiRenderableNode,
  VideoAiScene,
  VideoPoint,
} from "@/lib/types/video";

const DEFAULT_POINT = {
  x: 0,
  y: 0,
} as const satisfies VideoPoint;

const addPoints = (left: VideoPoint, right: VideoPoint): VideoPoint => ({
  x: left.x + right.x,
  y: left.y + right.y,
});

const scalePoint = (point: VideoPoint, scalar: number): VideoPoint => ({
  x: point.x * scalar,
  y: point.y * scalar,
});

const offsetNodePosition = (
  node: VideoAiRenderableNode,
  offset: VideoPoint
): VideoAiRenderableNode => ({
  ...node,
  x: (node.x ?? 0) + offset.x,
  y: (node.y ?? 0) + offset.y,
});

const expandRepeatNode = (
  id: string,
  node: Extract<VideoAiNode, { type: "repeat" }>
): [string, VideoAiRenderableNode][] => {
  const origin = node.origin ?? DEFAULT_POINT;
  const rowStep = node.rowStep ?? DEFAULT_POINT;
  const colStep = node.colStep ?? DEFAULT_POINT;
  const entries: [string, VideoAiRenderableNode][] = [];

  for (let row = 0; row < node.rows; row += 1) {
    for (let col = 0; col < node.cols; col += 1) {
      const offset = addPoints(
        origin,
        addPoints(scalePoint(rowStep, row), scalePoint(colStep, col))
      );
      entries.push([
        `${id}_r${row}_c${col}`,
        offsetNodePosition(node.template, offset),
      ]);
    }
  }

  return entries;
};

const expandTimelineTarget = (
  target: string | string[],
  repeatedNodeIds: Map<string, string[]>
): string | string[] => {
  const targets = Array.isArray(target) ? target : [target];
  const expanded = targets.flatMap(
    (value) => repeatedNodeIds.get(value) ?? [value]
  );

  if (!Array.isArray(target) && expanded.length === 1) {
    return expanded[0] ?? target;
  }

  return [...new Set(expanded)];
};

export const expandAiSceneMacros = (
  scene: VideoAiScene
): ExpandedVideoAiScene => {
  const expandedNodes: Record<string, VideoAiRenderableNode> = {};
  const repeatedNodeIds = new Map<string, string[]>();

  for (const [id, node] of Object.entries(scene.nodes)) {
    if (node.type !== "repeat") {
      if (expandedNodes[id]) {
        throw new Error(`Duplicate node ID "${id}" after macro expansion.`);
      }
      expandedNodes[id] = node;
      continue;
    }

    const repeatEntries = expandRepeatNode(id, node);
    repeatedNodeIds.set(
      id,
      repeatEntries.map(([generatedId]) => generatedId)
    );

    for (const [generatedId, generatedNode] of repeatEntries) {
      if (expandedNodes[generatedId]) {
        throw new Error(
          `Repeat "${id}" generated duplicate node ID "${generatedId}".`
        );
      }
      expandedNodes[generatedId] = generatedNode;
    }
  }

  const timeline = scene.timeline?.map((event) => ({
    ...event,
    target: expandTimelineTarget(event.target, repeatedNodeIds),
  }));

  return {
    ...scene,
    nodes: expandedNodes,
    timeline,
  };
};
