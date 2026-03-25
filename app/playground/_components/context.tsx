"use client";

import { createContext, useContext, useState } from "react";
import { useVideoGeneration } from "@/lib/hooks/use-video-generation";
import type { RenderVideoResponse } from "@/lib/types/prompt-to-video";
import type { VideoDescription } from "@/lib/types/video";
import type { Phase } from "@/lib/types/video-generation";

export interface Generation {
  id: string;
  prompt: string;
  scene: VideoDescription;
  video: RenderVideoResponse;
}

export interface PlaygroundContextValue {
  generations: Generation[];
  onSubmit: (e: React.FormEvent) => Promise<void>;
  pendingScene: VideoDescription | null;
  phase: Phase;
  prompt: string;
  selected: Generation | null;
  selectedId: string | null;
  setPrompt: (v: string) => void;
  setSelectedId: (id: string) => void;
}

export const PlaygroundContext = createContext<PlaygroundContextValue | null>(
  null
);

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
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected =
    generations.find((g) => g.id === selectedId) ?? generations[0] ?? null;

  const { generate, pendingScene, phase } = useVideoGeneration({
    mutationKey: "video/pipeline/playground",
    onSuccess: ({ prompt: nextPrompt, scene, video }) => {
      const id = crypto.randomUUID();
      setGenerations((prev) => [
        { id, prompt: nextPrompt, scene, video },
        ...prev,
      ]);
      setSelectedId(id);
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
