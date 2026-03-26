"use client";

import { useContext } from "react";
import type { RenderVideoResponse } from "@/lib/types/prompt-to-video";
import type { VideoDescription } from "@/lib/types/video";
import type { Phase } from "@/lib/types/video-generation";
import { PlaygroundContext } from "../playground/_components/context";
import { HomeContext } from "./context";
import { SCENE_JSON_INDENTATION } from "./helpers";

export type PreviewPage = "home" | "playground";

interface PreviewData {
  displayScene: VideoDescription | null;
  phase: Phase;
  resultScene: VideoDescription | null;
  resultVideo: RenderVideoResponse | null;
  sceneText: string;
}

export const usePreviewData = (page: PreviewPage): PreviewData => {
  const home = useContext(HomeContext);
  const playground = useContext(PlaygroundContext);
  const isPlayground = page === "playground";

  let displayScene: VideoDescription | null = null;
  let phase: Phase = "idle";
  let resultScene: VideoDescription | null = null;
  let resultVideo: RenderVideoResponse | null = null;

  if (isPlayground) {
    if (!playground) {
      throw new Error("usePreviewData must be inside PlaygroundProvider");
    }

    displayScene =
      playground.pendingScene ?? playground.selected?.scene ?? null;
    phase = playground.phase;
    resultScene = playground.selected?.scene ?? null;
    resultVideo = playground.selected?.video ?? null;
  } else {
    if (!home) {
      throw new Error("usePreviewData must be inside HomeProvider");
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

  return {
    displayScene,
    phase,
    resultScene,
    resultVideo,
    sceneText,
  };
};
