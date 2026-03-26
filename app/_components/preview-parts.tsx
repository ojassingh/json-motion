"use client";

import { Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoResult } from "@/components/video-result";
import type { RenderVideoResponse } from "@/lib/types/prompt-to-video";
import type { VideoDescription } from "@/lib/types/video";
import type { Phase } from "@/lib/types/video-generation";
import { cn } from "@/lib/utils";

export function PreviewCopyButton({
  copied,
  disabled,
  onCopy,
}: {
  copied: boolean;
  disabled: boolean;
  onCopy: () => Promise<void>;
}) {
  return (
    <Button
      disabled={disabled}
      onClick={onCopy}
      size="icon"
      type="button"
      variant="ghost"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
    </Button>
  );
}

export function SceneJsonContent({
  className,
  sceneText,
}: {
  className?: string;
  sceneText: string;
}) {
  return (
    <pre
      className={cn(
        "overflow-auto font-mono text-[11px] text-foreground/70 leading-5",
        className
      )}
    >
      {sceneText}
    </pre>
  );
}

export function VideoDisplay({
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
