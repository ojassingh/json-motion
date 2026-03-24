import type { VideoDescription } from "@/lib/types/video";

export const sampleVideoDescription: VideoDescription = {
  background: "#07111f",
  fps: 12,
  height: 360,
  scenes: [
    {
      background: "#07111f",
      durationInFrames: 24,
      id: "intro",
      nodes: [
        {
          animations: [
            {
              endFrame: 10,
              fromY: 40,
              name: "slide-in",
              startFrame: 0,
              type: "effect",
            },
            {
              endFrame: 10,
              name: "fade-in",
              startFrame: 0,
              type: "effect",
            },
          ],
          fill: "#0f172a",
          height: 220,
          id: "hero-card",
          radius: 24,
          transform: {
            x: 48,
            y: 72,
          },
          type: "rect",
          width: 544,
        },
        {
          color: "#f8fafc",
          fontSize: 42,
          fontWeight: 700,
          id: "headline",
          text: "Deterministic video,\nagent-first timing.",
          transform: {
            x: 88,
            y: 112,
          },
          type: "text",
        },
        {
          animations: [
            {
              endFrame: 23,
              keyframes: [
                {
                  frame: 0,
                  value: 0.9,
                },
                {
                  frame: 23,
                  value: 1.05,
                },
              ],
              property: "scaleX",
              startFrame: 0,
              type: "keyframes",
            },
            {
              endFrame: 23,
              keyframes: [
                {
                  frame: 0,
                  value: 0.9,
                },
                {
                  frame: 23,
                  value: 1.05,
                },
              ],
              property: "scaleY",
              startFrame: 0,
              type: "keyframes",
            },
          ],
          fill: "#38bdf8",
          height: 48,
          id: "accent-bar",
          radius: 999,
          transform: {
            x: 88,
            y: 280,
          },
          type: "rect",
          width: 180,
        },
      ],
      startFrame: 0,
    },
  ],
  width: 640,
};
