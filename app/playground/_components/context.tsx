"use client";

import { createContext, useContext, useState } from "react";
import useSWRMutation from "swr/mutation";
import { generateScene, renderVideo } from "@/lib/actions/video";
import { handleError } from "@/lib/handle-error";
import type { RenderVideoResponse } from "@/lib/types/prompt-to-video";
import type { VideoDescription } from "@/lib/types/video";

export type Phase = "idle" | "planning" | "rendering";

export interface Generation {
  id: string;
  prompt: string;
  scene: VideoDescription;
  video: RenderVideoResponse;
}

interface PlaygroundContextValue {
  generations: Generation[];
  onSubmit: (e: React.FormEvent) => void;
  pendingScene: VideoDescription | null;
  phase: Phase;
  prompt: string;
  selected: Generation | null;
  selectedId: string | null;
  setPrompt: (v: string) => void;
  setSelectedId: (id: string) => void;
}

const PlaygroundContext = createContext<PlaygroundContextValue | null>(null);

export function usePlayground(): PlaygroundContextValue {
  const ctx = useContext(PlaygroundContext);
  if (!ctx) {
    throw new Error("usePlayground must be inside PlaygroundProvider");
  }
  return ctx;
}

export function PlaygroundProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [pendingScene, setPendingScene] = useState<VideoDescription | null>(
    null
  );
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected =
    generations.find((g) => g.id === selectedId) ?? generations[0] ?? null;

  const { trigger } = useSWRMutation(
    "video/pipeline/playground",
    async (_key: string, { arg }: { arg: string }) => {
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
      onSuccess: ({ prompt: p, scene, video }) => {
        setPhase("idle");
        setPendingScene(null);
        const id = crypto.randomUUID();
        setGenerations((prev) => [{ id, prompt: p, scene, video }, ...prev]);
        setSelectedId(id);
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
    <PlaygroundContext.Provider
      value={{
        generations,
        onSubmit,
        pendingScene,
        phase,
        prompt,
        selected,
        selectedId,
        setPrompt,
        setSelectedId,
      }}
    >
      {children}
    </PlaygroundContext.Provider>
  );
}
