"use client";

import { useState } from "react";
import {
  PreviewCopyButton,
  SceneJsonContent,
  VideoDisplay,
} from "@/app/_components/preview-parts";
import { usePreviewData } from "@/app/_components/use-preview-data";
import { Button } from "@/components/ui/button";

export function PlaygroundPreviewPanels() {
  const {
    displayScene,
    inferenceMs,
    phase,
    rawOutput,
    rawOutputText,
    resultScene,
    resultVideo,
    sceneText,
  } = usePreviewData("playground");
  const [copied, setCopied] = useState(false);
  const [jsonView, setJsonView] = useState<"scene" | "raw">("scene");

  const currentText = jsonView === "raw" ? rawOutputText : sceneText;
  const copyDisabled =
    jsonView === "raw" ? !rawOutput && phase !== "planning" : !displayScene;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(currentText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-background">
      <section className="flex min-w-0 flex-1 flex-col border-border/70 border-r">
        <div className="flex h-9 items-center justify-between border-border/70 border-b px-3">
          <div className="flex items-center gap-1">
            <Button
              className={`font-mono text-xs ${jsonView === "scene" ? "text-foreground" : "text-muted-foreground/50"}`}
              onClick={() => setJsonView("scene")}
              size="xs"
              type="button"
              variant="ghost"
            >
              scene json
            </Button>
            <Button
              className={`font-mono text-xs ${jsonView === "raw" ? "text-foreground" : "text-muted-foreground/50"}`}
              onClick={() => setJsonView("raw")}
              size="xs"
              type="button"
              variant="ghost"
            >
              raw ai output
            </Button>
          </div>
          <PreviewCopyButton
            copied={copied}
            disabled={copyDisabled}
            onCopy={handleCopy}
          />
        </div>
        <SceneJsonContent
          className="min-h-0 flex-1 p-4"
          sceneText={currentText}
        />
      </section>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 items-center border-border/70 border-b px-3">
          <span className="font-mono text-foreground text-xs">live render</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <VideoDisplay
            inferenceMs={inferenceMs}
            phase={phase}
            scene={resultScene}
            video={resultVideo}
          />
        </div>
      </section>
    </div>
  );
}
