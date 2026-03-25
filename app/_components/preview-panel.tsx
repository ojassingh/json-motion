"use client";

import { Loader2 } from "lucide-react";
import { VideoResult } from "@/components/video-result";
import type { RenderVideoResponse } from "@/lib/types/prompt-to-video";
import type { VideoDescription } from "@/lib/types/video";
import type { Phase } from "./context";
import { useHome } from "./context";
import { SCENE_JSON_INDENTATION } from "./helpers";

export function PreviewPanel() {
  const { phase, pendingScene, latestScene, latestVideo } = useHome();
  const displayScene = pendingScene ?? latestScene;

  let sceneText = "waiting...";
  if (displayScene) {
    sceneText = JSON.stringify(displayScene, null, SCENE_JSON_INDENTATION);
  } else if (phase === "planning") {
    sceneText = "Generating scene JSON...";
  }

  return (
    <div className="w-full overflow-hidden rounded-lg border border-border/70">
      <div className="flex items-center border-border/70 border-b">
        <div className="flex flex-1 items-center border-border/70 border-r px-4 py-2.5">
          <span className="font-mono text-foreground text-xs">scene json</span>
        </div>
        <div className="flex flex-1 items-center px-4 py-2.5">
          <span className="font-mono text-foreground text-xs">live render</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-2">
        <div className="border-border/70 border-b lg:border-r lg:border-b-0">
          <pre className="max-h-[50vh] min-h-80 overflow-auto p-4 font-mono text-[11px] text-foreground/70 leading-5">
            {sceneText}
          </pre>
        </div>
        <div className="p-4">
          <VideoDisplay phase={phase} scene={latestScene} video={latestVideo} />
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
