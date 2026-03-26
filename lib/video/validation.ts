import type {
  VideoDescription,
  VideoNode,
  VideoScene,
} from "@/lib/types/video";

export interface VideoValidationIssue {
  message: string;
  path: Array<number | string>;
}

const collectNodeValidationIssues = (
  node: VideoNode,
  scene: VideoScene,
  path: Array<number | string>,
  seenIds: Set<string>
): VideoValidationIssue[] => {
  const issues: VideoValidationIssue[] = [];

  if (seenIds.has(node.id)) {
    issues.push({
      message: `Duplicate node id "${node.id}" found within scene "${scene.id}".`,
      path: [...path, "id"],
    });
  } else {
    seenIds.add(node.id);
  }

  if (
    node.type === "group" ||
    node.type === "center" ||
    node.type === "stack" ||
    node.type === "align"
  ) {
    for (const [childIndex, childNode] of node.children.entries()) {
      issues.push(
        ...collectNodeValidationIssues(
          childNode,
          scene,
          [...path, "children", childIndex],
          seenIds
        )
      );
    }
  }

  return issues;
};

export const collectVideoValidationIssues = (
  videoDescription: VideoDescription
): VideoValidationIssue[] => {
  const issues: VideoValidationIssue[] = [];
  let previousSceneEnd = -1;

  for (const [sceneIndex, scene] of videoDescription.scenes.entries()) {
    if (scene.startFrame <= previousSceneEnd) {
      issues.push({
        message:
          "Scenes must be ordered by ascending, non-overlapping frame ranges.",
        path: ["scenes", sceneIndex, "startFrame"],
      });
    }

    previousSceneEnd = scene.startFrame + scene.duration - 1;

    const seenIds = new Set<string>();

    for (const [nodeIndex, node] of scene.nodes.entries()) {
      issues.push(
        ...collectNodeValidationIssues(
          node,
          scene,
          ["scenes", sceneIndex, "nodes", nodeIndex],
          seenIds
        )
      );
    }
  }

  return issues;
};
