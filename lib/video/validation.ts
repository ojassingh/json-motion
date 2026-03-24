import type {
  VideoDescription,
  VideoKeyframeAnimation,
  VideoNode,
  VideoNodeAnimation,
  VideoScene,
} from "@/lib/types/video";

export interface VideoValidationIssue {
  message: string;
  path: Array<number | string>;
}

const validateAnimationWindow = (
  animation: VideoNodeAnimation,
  scene: VideoScene,
  path: Array<number | string>
): VideoValidationIssue[] => {
  const issues: VideoValidationIssue[] = [];

  if (animation.startFrame > animation.endFrame) {
    issues.push({
      message: "Animation startFrame must be less than or equal to endFrame.",
      path: [...path, "startFrame"],
    });
  }

  if (
    animation.startFrame < 0 ||
    animation.endFrame >= scene.durationInFrames
  ) {
    issues.push({
      message:
        "Animation frame window must fit within the containing scene duration.",
      path: [...path, "endFrame"],
    });
  }

  return issues;
};

const validateKeyframeAnimation = (
  animation: VideoKeyframeAnimation,
  path: Array<number | string>
): VideoValidationIssue[] => {
  const issues: VideoValidationIssue[] = [];

  let previousFrame = -1;

  for (const [index, keyframe] of animation.keyframes.entries()) {
    if (
      keyframe.frame < animation.startFrame ||
      keyframe.frame > animation.endFrame
    ) {
      issues.push({
        message: "Keyframe frames must remain inside the animation window.",
        path: [...path, "keyframes", index, "frame"],
      });
    }

    if (keyframe.frame < previousFrame) {
      issues.push({
        message: "Keyframes must be sorted in ascending frame order.",
        path: [...path, "keyframes", index, "frame"],
      });
    }

    previousFrame = keyframe.frame;
  }

  return issues;
};

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

  for (const [animationIndex, animation] of (node.animations ?? []).entries()) {
    const animationPath = [...path, "animations", animationIndex];

    issues.push(...validateAnimationWindow(animation, scene, animationPath));

    if (animation.type === "keyframes") {
      issues.push(...validateKeyframeAnimation(animation, animationPath));
    }
  }

  if (node.type === "group") {
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

    previousSceneEnd = scene.startFrame + scene.durationInFrames - 1;

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
