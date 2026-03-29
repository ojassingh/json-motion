"use client";

import { useState } from "react";
import useSWRMutation from "swr/mutation";
import { generateSceneWithMetadata, renderVideo } from "@/lib/actions/video";
import { handleError } from "@/lib/handle-error";
import type { RenderVideoResponse } from "@/lib/types/prompt-to-video";
import type { VideoAiOutput, VideoDescription } from "@/lib/types/video";
import type { Phase } from "@/lib/types/video-generation";

interface GeneratedVideo {
  prompt: string;
  rawOutput: VideoAiOutput;
  scene: VideoDescription;
  timings: {
    inferenceMs: number;
  };
  video: RenderVideoResponse;
}

export function useVideoGeneration({
  mutationKey,
  onStart,
  onSuccess,
}: {
  mutationKey: string;
  onStart?: () => void;
  onSuccess: (generation: GeneratedVideo) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [pendingScene, setPendingScene] = useState<VideoDescription | null>(
    null
  );
  const [pendingRawOutput, setPendingRawOutput] =
    useState<VideoAiOutput | null>(null);

  const { trigger } = useSWRMutation(
    mutationKey,
    async (_key: string, { arg }: { arg: string }) => {
      onStart?.();
      setPhase("planning");
      setPendingRawOutput(null);
      setPendingScene(null);
      let result: GeneratedVideo | undefined;
      try {
        const sceneResult = await generateSceneWithMetadata(arg);
        setPendingRawOutput(sceneResult.rawOutput);
        setPendingScene(sceneResult.scene);
        setPhase("rendering");
        const video = await renderVideo(sceneResult.scene);
        result = {
          prompt: arg,
          rawOutput: sceneResult.rawOutput,
          scene: sceneResult.scene,
          timings: sceneResult.timings,
          video,
        };
      } catch (error) {
        handleError(error);
      } finally {
        setPhase("idle");
        setPendingRawOutput(null);
        setPendingScene(null);
      }
      if (result) {
        onSuccess(result);
      }
      return result;
    },
    { throwOnError: false }
  );

  const generate = async (prompt: string): Promise<void> => {
    await trigger(prompt);
  };

  return { generate, pendingRawOutput, pendingScene, phase };
}
