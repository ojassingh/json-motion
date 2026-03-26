import type { VideoDescription } from "@/lib/types/video";

export const sampleVideoDescription: VideoDescription = {
  background: "#07111f",
  fps: 60,
  height: 360,
  scenes: [
    {
      background: "#0f172a",
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
          cornerRadius: 999,
          fill: "#38bdf8",
          height: 48,
          id: "accent-bar",
          initial: { scale: 0.9 },
          transition: { duration: "0.4s", easing: "ease-out" },
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
