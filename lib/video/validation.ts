import type { VideoDescription, VideoScene } from "@/lib/types/video";

export interface VideoValidationIssue {
  message: string;
  path: Array<number | string>;
}

const getNodeChildren = (node: VideoScene["nodes"][string]): string[] => {
  if (
    node.type === "align" ||
    node.type === "center" ||
    node.type === "stack"
  ) {
    return node.children;
  }
  return [];
};

const validateSceneTree = (
  scene: VideoScene,
  basePath: Array<number | string>
): VideoValidationIssue[] => {
  const issues: VideoValidationIssue[] = [];
  const nodeIds = new Set(Object.keys(scene.nodes));
  const parentByChild = new Map<string, string>();
  for (const [id, node] of Object.entries(scene.nodes)) {
    for (const [index, childId] of getNodeChildren(node).entries()) {
      if (!nodeIds.has(childId)) {
        issues.push({
          message: `Node "${id}" references non-existent child "${childId}".`,
          path: [...basePath, "nodes", id, "children", index],
        });
        continue;
      }
      const previousParent = parentByChild.get(childId);
      if (previousParent && previousParent !== id) {
        issues.push({
          message: `Node "${childId}" is referenced by both "${previousParent}" and "${id}".`,
          path: [...basePath, "nodes", id, "children", index],
        });
        continue;
      }
      parentByChild.set(childId, id);
    }
  }

  const roots = [...nodeIds].filter((id) => !parentByChild.has(id));
  if (roots.length === 0 && nodeIds.size > 0) {
    issues.push({
      message: "Scene nodes must form a rooted tree.",
      path: [...basePath, "nodes"],
    });
    return issues;
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();

  const walk = (id: string) => {
    if (visiting.has(id)) {
      issues.push({
        message: `Circular child reference detected at "${id}".`,
        path: [...basePath, "nodes", id],
      });
      return;
    }
    if (visited.has(id)) {
      return;
    }
    visiting.add(id);
    const node = scene.nodes[id];
    if (!node) {
      return;
    }
    for (const childId of getNodeChildren(node)) {
      walk(childId);
    }
    visiting.delete(id);
    visited.add(id);
  };

  for (const rootId of roots) {
    walk(rootId);
  }

  for (const id of nodeIds) {
    if (!visited.has(id)) {
      issues.push({
        message: `Node "${id}" is not reachable from a root node.`,
        path: [...basePath, "nodes", id],
      });
    }
  }

  return issues;
};

const validateTimelineTargets = (
  scene: VideoScene,
  basePath: Array<number | string>
): VideoValidationIssue[] => {
  const issues: VideoValidationIssue[] = [];
  const nodeIds = new Set(Object.keys(scene.nodes));

  for (const [i, event] of (scene.timeline ?? []).entries()) {
    const targets = Array.isArray(event.target) ? event.target : [event.target];
    for (const t of targets) {
      if (!nodeIds.has(t)) {
        issues.push({
          message: `Timeline event references non-existent target "${t}".`,
          path: [...basePath, "timeline", i, "target"],
        });
      }
    }
  }

  return issues;
};

export const collectVideoValidationIssues = (
  videoDescription: VideoDescription
): VideoValidationIssue[] => {
  const issues: VideoValidationIssue[] = [];
  let previousSceneEnd = -1;

  for (const [i, scene] of videoDescription.scenes.entries()) {
    if (scene.startFrame <= previousSceneEnd) {
      issues.push({
        message:
          "Scenes must be ordered by ascending, non-overlapping frame ranges.",
        path: ["scenes", i, "startFrame"],
      });
    }

    previousSceneEnd = scene.startFrame + scene.duration - 1;
    const basePath = ["scenes", i];
    issues.push(...validateSceneTree(scene, basePath));
    issues.push(...validateTimelineTargets(scene, basePath));
  }

  return issues;
};
