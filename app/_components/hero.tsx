import { ArrowRight } from "lucide-react";

export function Hero() {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
        Turn JSON scripts into 2D animations
      </p>
      <h1 className="font-semibold text-3xl tracking-tighter lg:text-6xl">
        AI
        <ArrowRight
          aria-hidden="true"
          className="mx-3 inline size-10 lg:size-16"
        />
        json-motion
        <ArrowRight
          aria-hidden="true"
          className="mx-3 inline size-10 lg:size-16"
        />
        video
      </h1>
      <p className="max-w-md text-muted-foreground text-sm sm:text-base">
        Describe your motion. AI generates a JSON scene, then renders it to
        video instantly.
      </p>
    </div>
  );
}
