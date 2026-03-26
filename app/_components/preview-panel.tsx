"use client";

import { Check, Copy, Loader2 } from "lucide-react";
import { useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import { VideoResult } from "@/components/video-result";
import type { RenderVideoResponse } from "@/lib/types/prompt-to-video";
import type { VideoDescription } from "@/lib/types/video";
import type { Phase } from "@/lib/types/video-generation";
import { cn } from "@/lib/utils";
import { PlaygroundContext } from "../playground/_components/context";
import { HomeContext } from "./context";
import { SCENE_JSON_INDENTATION } from "./helpers";

type PreviewPanelPage = "home" | "playground";

export function PreviewPanel({ page }: { page: PreviewPanelPage }) {
  const home = useContext(HomeContext);
  const playground = useContext(PlaygroundContext);
  const [copied, setCopied] = useState(false);
  const isPlayground = page === "playground";

  let displayScene: VideoDescription | null = null;
  let phase: Phase = "idle";
  let resultScene: VideoDescription | null = null;
  let resultVideo: RenderVideoResponse | null = null;

  if (isPlayground) {
    if (!playground) {
      throw new Error("PreviewPanel must be inside PlaygroundProvider");
    }

    displayScene =
      playground.pendingScene ?? playground.selected?.scene ?? null;
    phase = playground.phase;
    resultScene = playground.selected?.scene ?? null;
    resultVideo = playground.selected?.video ?? null;
  } else {
    if (!home) {
      throw new Error("PreviewPanel must be inside HomeProvider");
    }

    displayScene = home.pendingScene ?? home.latestScene;
    phase = home.phase;
    resultScene = home.latestScene;
    resultVideo = home.latestVideo;
  }

  let sceneText = "waiting...";
  if (displayScene) {
    sceneText = JSON.stringify(displayScene, null, SCENE_JSON_INDENTATION);
  } else if (phase === "planning") {
    sceneText = "Generating scene JSON...";
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(sceneText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "flex min-h-0 w-full flex-col overflow-hidden rounded-lg border border-border/70 bg-background",
        isPlayground && "h-full"
      )}
    >
      <div className="flex items-center border-border/70 border-b">
        <div className="flex flex-1 items-center justify-between border-border/70 border-r px-4 py-2.5">
          <span className="font-mono text-foreground text-xs">scene json</span>
          <Button
            disabled={!displayScene}
            onClick={handleCopy}
            size="icon"
            type="button"
            variant="ghost"
          >
            {copied ? (
              <Check className="size-3" />
            ) : (
              <Copy className="size-3" />
            )}
          </Button>
        </div>
        <div className="flex flex-1 items-center px-4 py-2.5">
          <span className="font-mono text-foreground text-xs">live render</span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-2">
        <div
          className={cn(
            "border-border/70 border-b lg:border-r lg:border-b-0",
            isPlayground && "min-h-0"
          )}
        >
          <pre
            className={cn(
              "overflow-auto p-4 font-mono text-[11px] text-foreground/70 leading-5",
              isPlayground ? "h-full min-h-80" : "max-h-[50vh] min-h-80"
            )}
          >
            {sceneText}
          </pre>
        </div>
        <div className={cn("p-4", isPlayground && "min-h-0 overflow-auto")}>
          <VideoDisplay phase={phase} scene={resultScene} video={resultVideo} />
        </div>
      </div>
    </div>
  );
}

function VideoDisplay({
  phase,
  scene,
  video,
}: {
  phase: Phase;
  scene: VideoDescription | null;
  video: RenderVideoResponse | null;
}) {
  if (phase === "planning" || phase === "rendering") {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center gap-2">
        <Loader2 className="size-4 animate-spin" />
        <p className="text-muted-foreground text-xs">
          {phase === "planning"
            ? "Waiting for scene JSON..."
            : "Rendering video..."}
        </p>
      </div>
    );
  }

  if (!(video && scene)) {
    return (
      <div className="flex min-h-72 items-center justify-center text-muted-foreground text-xs">
        waiting...
      </div>
    );
  }

  return <VideoResult scene={scene} video={video} />;
}
