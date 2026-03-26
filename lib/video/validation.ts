import type { VideoDescription, VideoScene } from "@/lib/types/video";

export interface VideoValidationIssue {
  message: string;
  path: Array<number | string>;
}

const validateSceneAnchors = (
  scene: VideoScene,
  basePath: Array<number | string>
): VideoValidationIssue[] => {
  const issues: VideoValidationIssue[] = [];
  const nodeIds = new Set(Object.keys(scene.nodes));

  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const id of nodeIds) {
    inDegree.set(id, 0);
  }

  for (const [id, node] of Object.entries(scene.nodes)) {
    if (!node.anchorTo) {
      continue;
    }

    if (!nodeIds.has(node.anchorTo)) {
      issues.push({
        message: `Node "${id}" references non-existent anchorTo target "${node.anchorTo}".`,
        path: [...basePath, "nodes", id, "anchorTo"],
      });
      continue;
    }

    inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
    const deps = dependents.get(node.anchorTo) ?? [];
    deps.push(id);
    dependents.set(node.anchorTo, deps);
  }

  const queue = [...nodeIds].filter((id) => (inDegree.get(id) ?? 0) === 0);
  let visited = 0;

  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) {
      break;
    }
    visited++;
    for (const dep of dependents.get(id) ?? []) {
      const next = (inDegree.get(dep) ?? 1) - 1;
      inDegree.set(dep, next);
      if (next === 0) {
        queue.push(dep);
      }
    }
  }

  if (visited < nodeIds.size) {
    issues.push({
      message: "Circular anchorTo dependency detected.",
      path: [...basePath, "nodes"],
    });
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
    issues.push(...validateSceneAnchors(scene, basePath));
    issues.push(...validateTimelineTargets(scene, basePath));
  }

  return issues;
};
