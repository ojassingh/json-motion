"use client";

import { Loader2 } from "lucide-react";
import { VideoResult } from "@/components/video-result";
import type { Generation } from "./context";
import { usePlayground } from "./context";

export function VideoPanel() {
  const { selected, phase } = usePlayground();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-border/60 border-b px-4 py-2.5">
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
          video preview
        </span>
      </div>
      <div className="flex flex-1 flex-col overflow-auto p-4">
        {phase !== "idle" && <LoadingState phase={phase} />}
        {phase === "idle" && selected && (
          <GenerationDisplay generation={selected} />
        )}
        {phase === "idle" && !selected && <EmptyState />}
      </div>
    </div>
  );
}

function LoadingState({ phase }: { phase: "planning" | "rendering" }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2">
      <Loader2 className="size-4 animate-spin text-muted-foreground" />
      <p className="text-muted-foreground text-xs">
        {phase === "planning" ? "Generating scene..." : "Rendering video..."}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center font-mono text-muted-foreground/50 text-xs">
      {"// enter a prompt to generate video"}
    </div>
  );
}

function GenerationDisplay({ generation }: { generation: Generation }) {
  return <VideoResult scene={generation.scene} video={generation.video} />;
}
