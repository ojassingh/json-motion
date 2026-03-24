"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { Navbar } from "@/components/navbar";
import { handleError } from "@/lib/handle-error";
import type {
  PromptToVideoSceneResponse,
  RenderVideoResponse,
} from "@/lib/types/prompt-to-video";
import { MAX_PROMPT_LENGTH } from "@/lib/types/prompt-to-video";
import type { VideoDescription } from "@/lib/types/video";

const SCENE_JSON_INDENTATION = 2;
const PROMPT_SUGGESTIONS = [
  "Square fades in and rotates 360 degrees.",
  "Bold title slides up, pauses, then fades away.",
  "Two panels reveal a product name with a clean outro card.",
  "Soft gradient background with a badge pop-in and closing CTA.",
] as const;

type Phase = "idle" | "planning" | "rendering";

export default function Page() {
  const promptFieldId = useId();
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [latestScene, setLatestScene] = useState<VideoDescription | null>(null);
  const [latestVideo, setLatestVideo] = useState<RenderVideoResponse | null>(
    null
  );

  const isSubmitting = phase !== "idle";

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    e.preventDefault();
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isSubmitting) {
      return;
    }

    setPhase("planning");
    setLatestScene(null);
    setLatestVideo(null);

    try {
      const sceneRes = await fetch("/api/generate-scene", {
        body: JSON.stringify({ prompt: trimmedPrompt }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!sceneRes.ok) {
        throw await sceneRes.json();
      }

      const { scene } = (await sceneRes.json()) as PromptToVideoSceneResponse;
      setLatestScene(scene);
      setPhase("rendering");

      const renderRes = await fetch("/api/render", {
        body: JSON.stringify(scene),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!renderRes.ok) {
        throw await renderRes.json();
      }

      setLatestVideo((await renderRes.json()) as RenderVideoResponse);
    } catch (error) {
      handleError(error);
    } finally {
      setPhase("idle");
    }
  };

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-5xl px-6 py-20">
        <section className="flex flex-col items-center gap-10" id="playground">
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
              Turn JSON scripts into 2D animations
            </p>
            <h1 className="font-bold text-3xl tracking-tight lg:text-6xl">
              AI
              <ArrowRight
                aria-hidden="true"
                className="mx-3 inline size-10 text-muted-foreground/40 sm:size-14 lg:size-16"
              />
              json-motion
              <ArrowRight
                aria-hidden="true"
                className="mx-3 inline size-10 text-muted-foreground/40 sm:size-14 lg:size-16"
              />
              video
            </h1>
            <p className="max-w-md text-muted-foreground text-sm sm:text-base">
              Describe your motion. AI generates a JSON scene, then renders it
              to video instantly.
            </p>
          </div>

          <div className="w-full" id="examples">
            <form
              className="flex flex-col items-center gap-3"
              onSubmit={handleSubmit}
            >
              <div className="relative flex w-full items-center">
                <label className="sr-only" htmlFor={promptFieldId}>
                  Scene prompt
                </label>
                <input
                  className="h-12 w-full rounded-lg border border-border bg-background px-4 pr-14 font-mono text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-50"
                  disabled={isSubmitting}
                  id={promptFieldId}
                  maxLength={MAX_PROMPT_LENGTH}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the motion you want to generate..."
                  type="text"
                  value={prompt}
                />
                <button
                  aria-label="Generate video"
                  className="absolute right-2 flex size-8 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-80 disabled:pointer-events-none disabled:opacity-30"
                  disabled={isSubmitting || prompt.trim().length === 0}
                  type="submit"
                >
                  {isSubmitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowRight className="size-4" />
                  )}
                </button>
              </div>

              <div className="flex flex-wrap justify-center gap-2">
                {PROMPT_SUGGESTIONS.map((suggestion) => (
                  <button
                    className="rounded-full border border-border/60 px-3 py-1 text-muted-foreground text-xs transition-colors hover:border-border hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                    disabled={isSubmitting}
                    key={suggestion}
                    onClick={() => setPrompt(suggestion)}
                    type="button"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </form>
          </div>

          <div className="w-full overflow-hidden rounded-lg border border-border/70">
            <div className="flex items-center border-border/70 border-b">
              <div className="flex flex-1 items-center gap-4 border-border/70 border-r px-4 py-2.5">
                <span className="font-mono text-foreground text-xs">
                  scene json
                </span>
              </div>
              <div className="flex flex-1 items-center justify-between px-4 py-2.5">
                <span className="font-mono text-foreground text-xs">
                  live render
                </span>
              </div>
            </div>

            <div className="grid lg:grid-cols-2">
              <div className="border-border/70 border-b lg:border-r lg:border-b-0">
                <pre className="overflow-y-scoll max-h-[50vh] min-h-80 overflow-auto p-4 font-mono text-[11px] text-foreground/70 leading-5">
                  {getSceneText(latestScene, phase)}
                </pre>
              </div>

              <div className="p-4">
                <RenderPanel
                  latestScene={latestScene}
                  latestVideo={latestVideo}
                  phase={phase}
                />
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

function getSceneText(scene: VideoDescription | null, phase: Phase): string {
  if (scene) {
    return JSON.stringify(scene, null, SCENE_JSON_INDENTATION);
  }
  if (phase === "planning") {
    return "Generating scene JSON...";
  }
  return "waiting...";
}

function RenderPanel({
  phase,
  latestScene,
  latestVideo,
}: {
  phase: Phase;
  latestScene: VideoDescription | null;
  latestVideo: RenderVideoResponse | null;
}) {
  if (phase === "planning" || phase === "rendering") {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center gap-2 text-center">
        <Loader2 className="size-4 animate-spin" />
        <p className="text-muted-foreground text-xs">
          {phase === "planning"
            ? "Waiting for scene JSON..."
            : "Rendering video..."}
        </p>
      </div>
    );
  }

  if (!(latestVideo && latestScene)) {
    return (
      <div className="flex min-h-72 items-center justify-center text-muted-foreground text-xs">
        waiting...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {latestVideo.url ? (
        // biome-ignore lint/a11y/useMediaCaption: <dont need>
        <video
          className="aspect-video w-full rounded-md border border-border/70 bg-muted/20 object-cover"
          controls
          src={latestVideo.url}
        />
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-md border border-border/60 border-dashed text-muted-foreground text-xs">
          Render finished without a preview URL.
        </div>
      )}

      <dl className="grid grid-cols-2 gap-2">
        <RenderDetail label="Job" value={latestVideo.jobId} />
        <RenderDetail label="Codec" value={latestVideo.codec} />
        <RenderDetail
          label="Frames"
          value={`${latestVideo.frameCount} at ${latestVideo.fps} fps`}
        />
        <RenderDetail
          label="Size"
          value={`${latestScene.width} × ${latestScene.height}`}
        />
      </dl>
    </div>
  );
}

function RenderDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2">
      <dt className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
        {label}
      </dt>
      <dd className="mt-1 truncate font-mono text-xs">{value}</dd>
    </div>
  );
}
