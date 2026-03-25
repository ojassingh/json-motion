"use client";

import { useState } from "react";
import useSWRMutation from "swr/mutation";
import { generateScene, renderVideo } from "@/lib/actions/video";
import { handleError } from "@/lib/handle-error";
import type { RenderVideoResponse } from "@/lib/types/prompt-to-video";
import type { VideoDescription } from "@/lib/types/video";
import type { Phase } from "@/lib/types/video-generation";

interface GeneratedVideo {
  prompt: string;
  scene: VideoDescription;
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

  const { trigger } = useSWRMutation(
    mutationKey,
    async (_key: string, { arg }: { arg: string }) => {
      onStart?.();
      setPhase("planning");
      setPendingScene(null);
      const scene = await generateScene(arg);
      setPendingScene(scene);
      setPhase("rendering");
      const video = await renderVideo(scene);
      return { prompt: arg, scene, video };
    },
    {
      throwOnError: false,
      onSuccess: (generation) => {
        setPhase("idle");
        setPendingScene(null);
        onSuccess(generation);
      },
      onError: (error) => {
        setPhase("idle");
        setPendingScene(null);
        handleError(error);
      },
    }
  );

  const generate = async (prompt: string): Promise<void> => {
    await trigger(prompt);
  };

  return { generate, pendingScene, phase };
}
