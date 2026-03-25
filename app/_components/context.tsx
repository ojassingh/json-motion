"use client";

import { createContext, useContext, useState } from "react";
import { useVideoGeneration } from "@/lib/hooks/use-video-generation";
import type { RenderVideoResponse } from "@/lib/types/prompt-to-video";
import type { VideoDescription } from "@/lib/types/video";
import type { Phase } from "@/lib/types/video-generation";

export interface HomeContextValue {
  latestScene: VideoDescription | null;
  latestVideo: RenderVideoResponse | null;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  pendingScene: VideoDescription | null;
  phase: Phase;
  prompt: string;
  setPrompt: (v: string) => void;
}

export const HomeContext = createContext<HomeContextValue | null>(null);

export function useHome(): HomeContextValue {
  const ctx = useContext(HomeContext);
  if (!ctx) {
    throw new Error("useHome must be inside HomeProvider");
  }
  return ctx;
}

export function HomeProvider({ children }: { children: React.ReactNode }) {
  const [prompt, setPrompt] = useState("");
  const [latestScene, setLatestScene] = useState<VideoDescription | null>(null);
  const [latestVideo, setLatestVideo] = useState<RenderVideoResponse | null>(
    null
  );
  const { generate, pendingScene, phase } = useVideoGeneration({
    mutationKey: "video/pipeline/home",
    onStart: () => {
      setLatestScene(null);
      setLatestVideo(null);
    },
    onSuccess: ({ scene, video }) => {
      setLatestScene(scene);
      setLatestVideo(video);
    },
  });

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || phase !== "idle") {
      return;
    }
    await generate(trimmed);
  };

  return (
    <HomeContext.Provider
      value={{
        prompt,
        setPrompt,
        phase,
        pendingScene,
        latestScene,
        latestVideo,
        onSubmit,
      }}
    >
      {children}
    </HomeContext.Provider>
  );
}
