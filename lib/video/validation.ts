import type {
  VideoColorAnimationValue,
  VideoDescription,
  VideoNode,
  VideoNumericAnimationValue,
  VideoScene,
} from "@/lib/types/video";
import {
  normalizeColorAnimationValue,
  normalizeNumericAnimationValue,
} from "@/lib/video/animation";

export interface VideoValidationIssue {
  message: string;
  path: Array<number | string>;
}

const collectAnimationWindowIssues = (
  scene: VideoScene,
  path: Array<number | string>,
  animationSteps:
    | ReturnType<typeof normalizeColorAnimationValue>
    | ReturnType<typeof normalizeNumericAnimationValue>
): VideoValidationIssue[] => {
  const issues: VideoValidationIssue[] = [];
  let previousEndFrame = -1;

  for (const [index, step] of animationSteps.entries()) {
    if (step.startFrame > step.endFrame) {
      issues.push({
        message: "Animation start must be less than or equal to end.",
        path: [...path, index, "start"],
      });
    }

    if (step.endFrame >= scene.duration) {
      issues.push({
        message:
          "Animation frame window must fit within the containing scene duration.",
        path: [...path, index, "end"],
      });
    }

    if (step.startFrame <= previousEndFrame) {
      issues.push({
        message:
          "Animation steps for a property must be ordered and non-overlapping.",
        path: [...path, index, "start"],
      });
    }

    previousEndFrame = step.endFrame;
  }

  return issues;
};

const collectNumericAnimationIssues = (
  scene: VideoScene,
  path: Array<number | string>,
  value: VideoNumericAnimationValue | undefined,
  fps: number
): VideoValidationIssue[] =>
  value
    ? collectAnimationWindowIssues(
        scene,
        path,
        normalizeNumericAnimationValue(value, fps)
      )
    : [];

const collectColorAnimationIssues = (
  scene: VideoScene,
  path: Array<number | string>,
  value: VideoColorAnimationValue | undefined,
  fps: number
): VideoValidationIssue[] =>
  value
    ? collectAnimationWindowIssues(
        scene,
        path,
        normalizeColorAnimationValue(value, fps)
      )
    : [];

const appendNumericAnimationIssues = (
  issues: VideoValidationIssue[],
  scene: VideoScene,
  fps: number,
  path: Array<number | string>,
  entries: Array<{
    name: string;
    value: VideoNumericAnimationValue | undefined;
  }>
): void => {
  for (const entry of entries) {
    issues.push(
      ...collectNumericAnimationIssues(
        scene,
        [...path, entry.name],
        entry.value,
        fps
      )
    );
  }
};

const appendColorAnimationIssues = (
  issues: VideoValidationIssue[],
  scene: VideoScene,
  fps: number,
  path: Array<number | string>,
  entries: Array<{
    name: string;
    value: VideoColorAnimationValue | undefined;
  }>
): void => {
  for (const entry of entries) {
    issues.push(
      ...collectColorAnimationIssues(
        scene,
        [...path, entry.name],
        entry.value,
        fps
      )
    );
  }
};

const collectNodeAnimationIssues = (
  node: VideoNode,
  scene: VideoScene,
  fps: number,
  path: Array<number | string>
): VideoValidationIssue[] => {
  const issues: VideoValidationIssue[] = [];
  const animatePath = [...path, "animate"];

  appendNumericAnimationIssues(issues, scene, fps, animatePath, [
    { name: "opacity", value: node.animate?.opacity },
    { name: "rotate", value: node.animate?.rotate },
    { name: "scale", value: node.animate?.scale },
    { name: "scaleX", value: node.animate?.scaleX },
    { name: "scaleY", value: node.animate?.scaleY },
    { name: "skewX", value: node.animate?.skewX },
    { name: "skewY", value: node.animate?.skewY },
    { name: "x", value: node.animate?.x },
    { name: "y", value: node.animate?.y },
  ]);

  if (node.type === "rect") {
    appendNumericAnimationIssues(issues, scene, fps, animatePath, [
      { name: "cornerRadius", value: node.animate?.cornerRadius },
      { name: "height", value: node.animate?.height },
      { name: "strokeWidth", value: node.animate?.strokeWidth },
      { name: "width", value: node.animate?.width },
    ]);
    appendColorAnimationIssues(issues, scene, fps, animatePath, [
      { name: "fill", value: node.animate?.fill },
      { name: "stroke", value: node.animate?.stroke },
    ]);
  }

  if (node.type === "text") {
    appendNumericAnimationIssues(issues, scene, fps, animatePath, [
      { name: "size", value: node.animate?.size },
    ]);
    appendColorAnimationIssues(issues, scene, fps, animatePath, [
      { name: "color", value: node.animate?.color },
    ]);
  }

  if (node.type === "image") {
    appendNumericAnimationIssues(issues, scene, fps, animatePath, [
      { name: "height", value: node.animate?.height },
      { name: "width", value: node.animate?.width },
    ]);
  }

  return issues;
};

const collectNodeValidationIssues = (
  node: VideoNode,
  scene: VideoScene,
  fps: number,
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

  issues.push(...collectNodeAnimationIssues(node, scene, fps, path));

  if (node.type === "group") {
    for (const [childIndex, childNode] of node.children.entries()) {
      issues.push(
        ...collectNodeValidationIssues(
          childNode,
          scene,
          fps,
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

    if (scene.background && typeof scene.background !== "string") {
      issues.push(
        ...collectColorAnimationIssues(
          scene,
          ["scenes", sceneIndex, "background"],
          scene.background,
          videoDescription.fps
        )
      );
    }

    const seenIds = new Set<string>();

    for (const [nodeIndex, node] of scene.nodes.entries()) {
      issues.push(
        ...collectNodeValidationIssues(
          node,
          scene,
          videoDescription.fps,
          ["scenes", sceneIndex, "nodes", nodeIndex],
          seenIds
        )
      );
    }
  }

  return issues;
};
