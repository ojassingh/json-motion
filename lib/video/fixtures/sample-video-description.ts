import type { VideoDescription } from "@/lib/types/video";

export const sampleVideoDescription: VideoDescription = {
  background: "#07111f",
  fps: 12,
  height: 360,
  scenes: [
    {
      background: [
        {
          end: 11,
          from: "#07111f",
          to: "#0f172a",
        },
        {
          end: 23,
          from: "#0f172a",
          start: 12,
          to: "#111827",
        },
      ],
      duration: 24,
      id: "intro",
      nodes: [
        {
          cornerRadius: 24,
          fill: "#0f172a",
          height: 220,
          id: "hero-card",
          primitives: ["FadeIn", "SlideIn"],
          type: "rect",
          width: 544,
          x: 48,
          y: 72,
        },
        {
          color: "#f8fafc",
          fontWeight: 700,
          id: "headline",
          size: 42,
          text: "Deterministic video,\nagent-first timing.",
          type: "text",
          x: 88,
          y: 112,
        },
        {
          animate: {
            scale: {
              end: 23,
              from: 0.9,
              to: 1.05,
            },
          },
          cornerRadius: 999,
          fill: "#38bdf8",
          height: 48,
          id: "accent-bar",
          type: "rect",
          width: 180,
          x: 88,
          y: 280,
        },
      ],
      startFrame: 0,
    },
  ],
  width: 640,
};
