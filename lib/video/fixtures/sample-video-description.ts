import type { IconNode } from "lucide-react";

import type { VideoDescription } from "@/lib/types/video";
import { createVideoIconNode } from "@/lib/video/lucide";

const arrowRightIconNode: IconNode = [
  ["path", { d: "M5 12h14" }],
  ["path", { d: "m12 5 7 7-7 7" }],
];

export const sampleVideoDescription: VideoDescription = {
  background: "#07111f",
  fps: 60,
  height: 360,
  scenes: [
    {
      background: "#0f172a",
      duration: 24,
      id: "intro",
      nodes: {
        "hero-card": {
          cornerRadius: 24,
          fill: "#0f172a",
          height: 220,
          opacity: 0,
          type: "rect",
          width: 544,
          x: 48,
          y: 72,
        },
        headline: {
          color: "#f8fafc",
          fontWeight: 700,
          opacity: 0,
          size: 42,
          text: "Deterministic video,\nagent-first timing.",
          type: "text",
          x: 88,
          y: 112,
        },
        "accent-bar": {
          cornerRadius: 999,
          fill: "#38bdf8",
          height: 48,
          opacity: 0,
          type: "rect",
          width: 180,
          x: 88,
          y: 280,
        },
        "accent-icon": createVideoIconNode({
          height: 24,
          iconNode: arrowRightIconNode,
          opacity: 0,
          stroke: "#0f172a",
          strokeWidth: 2.5,
          width: 24,
          x: 228,
          y: 292,
        }),
      },
      startFrame: 0,
      timeline: [
        {
          at: 0.05,
          dur: 0.15,
          ease: "ease-out",
          opacity: 1,
          target: ["hero-card", "headline", "accent-bar", "accent-icon"],
        },
      ],
    },
  ],
  width: 640,
};
