"use client";

import { useState } from "react";
import {
  PreviewCopyButton,
  SceneJsonContent,
  VideoDisplay,
} from "./preview-parts";
import { usePreviewData } from "./use-preview-data";

export function PreviewPanel() {
  const { displayScene, phase, resultScene, resultVideo, sceneText } =
    usePreviewData("home");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(sceneText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex min-h-0 w-full flex-col overflow-hidden rounded-lg border border-border/70 bg-background">
      <div className="flex items-center border-border/70 border-b">
        <div className="flex flex-1 items-center justify-between border-border/70 border-r px-4 py-2.5">
          <span className="font-mono text-foreground text-xs">scene json</span>
          <PreviewCopyButton
            copied={copied}
            disabled={!displayScene}
            onCopy={handleCopy}
          />
        </div>
        <div className="flex flex-1 items-center px-4 py-2.5">
          <span className="font-mono text-foreground text-xs">live render</span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-2">
        <div className="border-border/70 border-b lg:border-r lg:border-b-0">
          <SceneJsonContent
            className="max-h-[50vh] min-h-80 p-4"
            sceneText={sceneText}
          />
        </div>
        <div className="p-4">
          <VideoDisplay phase={phase} scene={resultScene} video={resultVideo} />
        </div>
      </div>
    </div>
  );
}
