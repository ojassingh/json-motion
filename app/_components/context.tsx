"use client";

import { createContext, useContext, useState } from "react";
import useSWRMutation from "swr/mutation";
import { generateScene, renderVideo } from "@/lib/actions/video";
import { handleError } from "@/lib/handle-error";
import type { RenderVideoResponse } from "@/lib/types/prompt-to-video";
import type { VideoDescription } from "@/lib/types/video";

export type Phase = "idle" | "planning" | "rendering";

interface HomeContextValue {
  latestScene: VideoDescription | null;
  latestVideo: RenderVideoResponse | null;
  onSubmit: (e: React.FormEvent) => void;
  pendingScene: VideoDescription | null;
  phase: Phase;
  prompt: string;
  setPrompt: (v: string) => void;
}

const HomeContext = createContext<HomeContextValue | null>(null);

export function useHome(): HomeContextValue {
  const ctx = useContext(HomeContext);
  if (!ctx) {
    throw new Error("useHome must be inside HomeProvider");
  }
  return ctx;
}

export function HomeProvider({ children }: { children: React.ReactNode }) {
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [pendingScene, setPendingScene] = useState<VideoDescription | null>(
    null
  );
  const [latestScene, setLatestScene] = useState<VideoDescription | null>(null);
  const [latestVideo, setLatestVideo] = useState<RenderVideoResponse | null>(
    null
  );

  const { trigger } = useSWRMutation(
    "video/pipeline/home",
    async (_key: string, { arg }: { arg: string }) => {
      setPhase("planning");
      setPendingScene(null);
      setLatestScene(null);
      setLatestVideo(null);
      const scene = await generateScene(arg);
      setPendingScene(scene);
      setPhase("rendering");
      const video = await renderVideo(scene);
      return { scene, video };
    },
    {
      throwOnError: false,
      onSuccess: ({ scene, video }) => {
        setPhase("idle");
        setPendingScene(null);
        setLatestScene(scene);
        setLatestVideo(video);
      },
      onError: (err) => {
        setPhase("idle");
        setPendingScene(null);
        handleError(err);
      },
    }
  );

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || phase !== "idle") {
      return;
    }
    trigger(trimmed);
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
