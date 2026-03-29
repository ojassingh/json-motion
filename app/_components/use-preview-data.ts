"use client";

import { useContext } from "react";
import type { RenderVideoResponse } from "@/lib/types/prompt-to-video";
import type { VideoAiOutput, VideoDescription } from "@/lib/types/video";
import type { Phase } from "@/lib/types/video-generation";
import { PlaygroundContext } from "../playground/_components/context";
import { HomeContext } from "./context";
import { SCENE_JSON_INDENTATION } from "./helpers";

export type PreviewPage = "home" | "playground";

interface PreviewData {
  displayScene: VideoDescription | null;
  inferenceMs: number | null;
  phase: Phase;
  rawOutput: VideoAiOutput | null;
  rawOutputText: string;
  resultScene: VideoDescription | null;
  resultVideo: RenderVideoResponse | null;
  sceneText: string;
}

export const usePreviewData = (page: PreviewPage): PreviewData => {
  const home = useContext(HomeContext);
  const playground = useContext(PlaygroundContext);
  const isPlayground = page === "playground";

  let displayScene: VideoDescription | null = null;
  let inferenceMs: number | null = null;
  let phase: Phase = "idle";
  let rawOutput: VideoAiOutput | null = null;
  let resultScene: VideoDescription | null = null;
  let resultVideo: RenderVideoResponse | null = null;

  if (isPlayground) {
    if (!playground) {
      throw new Error("usePreviewData must be inside PlaygroundProvider");
    }

    displayScene =
      playground.pendingScene ?? playground.selected?.scene ?? null;
    inferenceMs = playground.selected?.inferenceMs ?? null;
    phase = playground.phase;
    rawOutput =
      playground.pendingRawOutput ?? playground.selected?.rawOutput ?? null;
    resultScene = playground.selected?.scene ?? null;
    resultVideo = playground.selected?.video ?? null;
  } else {
    if (!home) {
      throw new Error("usePreviewData must be inside HomeProvider");
    }

    displayScene = home.pendingScene ?? home.latestScene;
    inferenceMs = home.latestInferenceMs;
    phase = home.phase;
    rawOutput = home.pendingRawOutput ?? home.latestRawOutput;
    resultScene = home.latestScene;
    resultVideo = home.latestVideo;
  }

  let sceneText = "waiting...";
  if (displayScene) {
    sceneText = JSON.stringify(displayScene, null, SCENE_JSON_INDENTATION);
  } else if (phase === "planning") {
    sceneText = "Generating scene JSON...";
  }

  let rawOutputText = "waiting...";
  if (rawOutput) {
    rawOutputText = JSON.stringify(rawOutput, null, SCENE_JSON_INDENTATION);
  } else if (phase === "planning") {
    rawOutputText = "Waiting for raw AI output...";
  }

  return {
    displayScene,
    inferenceMs,
    phase,
    rawOutput,
    resultScene,
    resultVideo,
    rawOutputText,
    sceneText,
  };
};
