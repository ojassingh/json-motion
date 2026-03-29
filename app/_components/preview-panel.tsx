"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  PreviewCopyButton,
  SceneJsonContent,
  VideoDisplay,
} from "./preview-parts";
import { usePreviewData } from "./use-preview-data";

export function PreviewPanel() {
  const {
    displayScene,
    inferenceMs,
    phase,
    rawOutput,
    rawOutputText,
    resultScene,
    resultVideo,
    sceneText,
  } = usePreviewData("home");
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
    <div className="flex h-128 min-h-0 w-full flex-col overflow-hidden rounded-lg border border-border/70 bg-background">
      <div className="flex border-border/70 border-b">
        <div className="flex h-9 flex-1 items-center justify-between border-border/70 border-r px-4">
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
        <div className="flex h-9 flex-1 items-center px-4">
          <span className="font-mono text-foreground text-xs">live render</span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col border-border/70 border-b lg:border-r lg:border-b-0">
          <SceneJsonContent
            className="min-h-0 flex-1 p-4"
            sceneText={currentText}
          />
        </div>
        <div className="min-h-0 overflow-auto p-4">
          <VideoDisplay
            inferenceMs={inferenceMs}
            phase={phase}
            scene={resultScene}
            video={resultVideo}
          />
        </div>
      </div>
    </div>
  );
}
