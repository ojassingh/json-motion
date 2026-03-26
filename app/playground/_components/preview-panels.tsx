"use client";

import { useState } from "react";
import {
  PreviewCopyButton,
  SceneJsonContent,
  VideoDisplay,
} from "@/app/_components/preview-parts";
import { usePreviewData } from "@/app/_components/use-preview-data";

export function PlaygroundPreviewPanels() {
  const { displayScene, phase, resultScene, resultVideo, sceneText } =
    usePreviewData("playground");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(sceneText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-background">
      <section className="flex min-w-0 flex-1 flex-col border-border/70 border-r">
        <div className="flex items-center justify-between border-border/70 border-b px-3 py-2.5">
          <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
            scene json
          </span>
          <PreviewCopyButton
            copied={copied}
            disabled={!displayScene}
            onCopy={handleCopy}
          />
        </div>
        <SceneJsonContent
          className="min-h-0 flex-1 p-4"
          sceneText={sceneText}
        />
      </section>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="border-border/70 border-b px-3 py-2.5">
          <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
            live render
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <VideoDisplay phase={phase} scene={resultScene} video={resultVideo} />
        </div>
      </section>
    </div>
  );
}
