import type {
  ExpandedVideoAiScene,
  VideoAiNode,
  VideoAiRenderableNode,
  VideoAiScene,
  VideoPoint,
  VideoVector,
} from "@/lib/types/video";

const addPoints = (left: VideoPoint, right: VideoPoint): VideoPoint => ({
  x: left.x + right.x,
  y: left.y + right.y,
});

const scalePoint = (point: VideoPoint, scalar: number): VideoPoint => ({
  x: point.x * scalar,
  y: point.y * scalar,
});

const vectorToPoint = (vector?: VideoVector): VideoPoint => ({
  x: vector?.x ?? 0,
  y: vector?.y ?? 0,
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
  const origin = vectorToPoint(node.origin);
  const rowStep = vectorToPoint(node.rowStep);
  const colStep = vectorToPoint(node.colStep);
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

const assertRepeatNodesAreNotUsedAsChildren = (
  scene: VideoAiScene,
  repeatedNodeIds: Set<string>
): void => {
  for (const [id, node] of Object.entries(scene.nodes)) {
    if (
      node.type !== "align" &&
      node.type !== "center" &&
      node.type !== "stack"
    ) {
      continue;
    }

    const repeatedChild = node.children.find((childId) =>
      repeatedNodeIds.has(childId)
    );
    if (repeatedChild) {
      throw new Error(
        `Repeat node "${repeatedChild}" cannot be referenced from layout node "${id}". Use \`origin\`, \`rowStep\`, and \`colStep\` to place repeated content directly.`
      );
    }
  }
};

export const expandAiSceneMacros = (
  scene: VideoAiScene
): ExpandedVideoAiScene => {
  const expandedNodes: Record<string, VideoAiRenderableNode> = {};
  const repeatedNodeIds = new Map<string, string[]>();
  const repeatedNodeIdSet = new Set(
    Object.entries(scene.nodes)
      .filter(([, node]) => node.type === "repeat")
      .map(([id]) => id)
  );

  assertRepeatNodesAreNotUsedAsChildren(scene, repeatedNodeIdSet);

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
