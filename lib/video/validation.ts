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

const validateArrowNodes = (
  scene: VideoScene,
  basePath: Array<number | string>
): VideoValidationIssue[] => {
  const issues: VideoValidationIssue[] = [];
  const nodeIds = new Set(Object.keys(scene.nodes));
  const pushIssue = (message: string, path: Array<number | string>): void => {
    issues.push({ message, path });
  };

  const validateEndpointRef = (
    arrowId: string,
    endpointName: "from" | "to",
    endpoint: unknown
  ): void => {
    if (!(endpoint && typeof endpoint === "object" && "node" in endpoint)) {
      return;
    }
    const ref = endpoint as { node: string };
    if (!nodeIds.has(ref.node)) {
      pushIssue(
        `Arrow "${arrowId}" references non-existent endpoint node "${ref.node}".`,
        [...basePath, "nodes", arrowId, endpointName, "node"]
      );
    }
  };

  const validateArrowNode = (
    id: string,
    node: Extract<VideoScene["nodes"][string], { type: "arrow" }>
  ): void => {
    const usesTargetMode = node.target != null || node.position != null;
    const usesEndpointMode = node.from != null || node.to != null;
    const nodePath = [...basePath, "nodes", id];
    const validateTargetMode = (): void => {
      if (!(node.target && node.position)) {
        pushIssue(
          `Arrow "${id}" must provide both \`target\` and \`position\` when using target-based placement.`,
          nodePath
        );
        return;
      }
      if (!nodeIds.has(node.target)) {
        pushIssue(
          `Arrow "${id}" references non-existent target "${node.target}".`,
          [...nodePath, "target"]
        );
      }
    };
    const validateEndpointMode = (): void => {
      if (!(node.from && node.to)) {
        pushIssue(
          `Arrow "${id}" must provide both \`from\` and \`to\` when using endpoint placement.`,
          nodePath
        );
      }
      validateEndpointRef(id, "from", node.from);
      validateEndpointRef(id, "to", node.to);
    };

    if (!(usesTargetMode || usesEndpointMode)) {
      pushIssue(
        `Arrow "${id}" must define either \`target\` + \`position\` or both \`from\` and \`to\`.`,
        nodePath
      );
      return;
    }

    if (usesTargetMode && usesEndpointMode) {
      pushIssue(
        `Arrow "${id}" cannot mix \`target\`/\`position\` placement with \`from\`/\`to\` endpoints.`,
        nodePath
      );
    }

    if (usesTargetMode) {
      validateTargetMode();
    }

    if (usesEndpointMode) {
      validateEndpointMode();
    }
  };

  for (const [id, node] of Object.entries(scene.nodes)) {
    if (node.type === "arrow") {
      validateArrowNode(id, node);
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
    issues.push(...validateArrowNodes(scene, basePath));
    issues.push(...validateTimelineTargets(scene, basePath));
  }

  return issues;
};
