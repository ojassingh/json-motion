"use client";

import { startTransition, useId, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type {
  PromptToVideoErrorResponse,
  PromptToVideoResponse,
  PromptToVideoSuccessResponse,
} from "@/lib/types/prompt-to-video";

const DEFAULT_PROMPT =
  "A bold launch teaser with layered panels, a headline reveal, and a closing call to action.";
const SCENE_JSON_INDENTATION = 2;
const GENERATED_VIDEO_CAPTIONS_TRACK =
  "data:text/vtt;charset=utf-8,WEBVTT%0A%0A00:00:00.000%20-->%2099:59:59.000%0ANo%20spoken%20audio.%0A";

const createFallbackErrorResponse = (
  message: string
): PromptToVideoErrorResponse => ({
  error: {
    code: "GENERATION_ERROR",
    details: [message],
    message: "The request could not be completed.",
  },
});

const getErrorDetails = (
  errorResponse: PromptToVideoErrorResponse
): string | null => {
  if (errorResponse.error.details.length === 0) {
    return null;
  }

  return errorResponse.error.details.join(" ");
};

const getPromptToVideoResponse = async (
  response: Response
): Promise<PromptToVideoResponse> =>
  (await response.json()) as PromptToVideoResponse;

export function PromptToVideoPage() {
  const promptFieldId = useId();
  const promptHintId = useId();
  const promptErrorId = useId();
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [latestPrompt, setLatestPrompt] = useState<string | null>(null);
  const [latestSuccess, setLatestSuccess] =
    useState<PromptToVideoSuccessResponse | null>(null);
  const [errorResponse, setErrorResponse] =
    useState<PromptToVideoErrorResponse | null>(null);

  const isPromptBlank = prompt.trim().length === 0;
  const promptDescriptionIds = errorResponse
    ? `${promptHintId} ${promptErrorId}`
    : promptHintId;

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault();

    if (isPromptBlank || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorResponse(null);

    try {
      const response = await fetch("/api/generate-video", {
        body: JSON.stringify({ prompt }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      const responseBody = await getPromptToVideoResponse(response);

      if ("error" in responseBody) {
        startTransition(() => {
          setErrorResponse(responseBody);
        });

        return;
      }

      startTransition(() => {
        setErrorResponse(null);
        setLatestPrompt(prompt.trim());
        setLatestSuccess(responseBody);
      });
    } catch (error) {
      const fallbackErrorResponse =
        error instanceof Error
          ? createFallbackErrorResponse(error.message)
          : createFallbackErrorResponse(
              "Check your local server and try generating again."
            );

      startTransition(() => {
        setErrorResponse(fallbackErrorResponse);
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative min-h-svh overflow-hidden bg-background">
      <div className="absolute inset-x-0 top-0 h-72 bg-linear-to-b from-primary/12 via-secondary/35 to-transparent blur-3xl" />
      <div className="absolute top-16 left-1/2 size-72 -translate-x-1/2 rounded-full border border-border/50 bg-card/40 blur-3xl" />

      <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8 sm:px-8 sm:py-10">
        <section className="flex max-w-3xl flex-col gap-4">
          <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.32em]">
            Prompt To Video
          </p>
          <div className="flex flex-col gap-3">
            <h1 className="max-w-2xl font-heading font-medium text-4xl tracking-tight sm:text-5xl">
              Describe a scene and render a motion clip without touching scene
              JSON.
            </h1>
            <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
              This first pass keeps everything in memory. Submit one prompt,
              wait for the generated scene, and inspect both the rendered video
              and the exact schema-valid output on the same screen.
            </p>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <Card className="border border-border/80 bg-card/90 shadow-sm backdrop-blur">
            <CardHeader>
              <CardTitle>Generate a video</CardTitle>
              <CardDescription>
                Keep prompts concrete. Mention the motion, pacing, and the text
                you want on screen.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                <div className="flex flex-col gap-2">
                  <label
                    className="font-medium text-sm"
                    htmlFor={promptFieldId}
                  >
                    Scene prompt
                  </label>
                  <Textarea
                    aria-describedby={promptDescriptionIds}
                    aria-invalid={errorResponse ? true : undefined}
                    className="min-h-40 bg-background/80 text-sm"
                    disabled={isSubmitting}
                    id={promptFieldId}
                    onChange={(event) => {
                      setPrompt(event.target.value);
                    }}
                    placeholder="A midnight product teaser with a headline reveal and a quiet ending card."
                    value={prompt}
                  />
                  <div
                    className="flex items-center justify-between gap-3 text-muted-foreground text-xs/relaxed"
                    id={promptHintId}
                  >
                    <p>
                      Structured output stays within the renderer&apos;s
                      supported scene schema.
                    </p>
                    <p>{prompt.trim().length}/600</p>
                  </div>
                </div>

                {errorResponse ? (
                  <Alert
                    className="border-destructive/30"
                    id={promptErrorId}
                    variant="destructive"
                  >
                    <AlertTitle>{errorResponse.error.message}</AlertTitle>
                    <AlertDescription>
                      {getErrorDetails(errorResponse) ??
                        "Try tightening the prompt and submit again."}
                    </AlertDescription>
                  </Alert>
                ) : null}

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-muted-foreground text-xs/relaxed">
                    {isSubmitting
                      ? "Generating a schema-valid scene and rendering the clip."
                      : "No history is stored. Each request replaces the latest result."}
                  </p>
                  <Button
                    disabled={isSubmitting || isPromptBlank}
                    type="submit"
                  >
                    {isSubmitting ? "Generating video..." : "Generate video"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            <Card className="border border-border/80 bg-card/90 shadow-sm backdrop-blur">
              <CardHeader>
                <CardTitle>Latest render</CardTitle>
                <CardDescription>
                  {latestPrompt
                    ? `Prompt: “${latestPrompt}”`
                    : "Your latest successful generation will appear here."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {latestSuccess ? (
                  <>
                    {latestSuccess.video.url ? (
                      <video
                        className="aspect-video w-full rounded-md border border-border/70 bg-muted/40 object-cover"
                        controls
                        src={latestSuccess.video.url}
                      >
                        <track
                          default
                          kind="captions"
                          label="Generated video captions"
                          src={GENERATED_VIDEO_CAPTIONS_TRACK}
                        />
                        Your browser does not support HTML5 video playback.
                      </video>
                    ) : (
                      <div className="flex aspect-video items-center justify-center rounded-md border border-border/80 border-dashed bg-muted/30 text-center text-muted-foreground text-sm">
                        The render finished without a public preview URL.
                      </div>
                    )}

                    <dl className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-md border border-border/70 bg-background/70 p-3">
                        <dt className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                          Job
                        </dt>
                        <dd className="mt-2 font-medium text-sm">
                          {latestSuccess.video.jobId}
                        </dd>
                      </div>
                      <div className="rounded-md border border-border/70 bg-background/70 p-3">
                        <dt className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                          Codec
                        </dt>
                        <dd className="mt-2 font-medium text-sm">
                          {latestSuccess.video.codec}
                        </dd>
                      </div>
                      <div className="rounded-md border border-border/70 bg-background/70 p-3">
                        <dt className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                          Frames
                        </dt>
                        <dd className="mt-2 font-medium text-sm">
                          {latestSuccess.video.frameCount} at{" "}
                          {latestSuccess.video.fps} fps
                        </dd>
                      </div>
                      <div className="rounded-md border border-border/70 bg-background/70 p-3">
                        <dt className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                          Size
                        </dt>
                        <dd className="mt-2 font-medium text-sm">
                          {latestSuccess.video.width} ×{" "}
                          {latestSuccess.video.height}
                        </dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-md border border-border/80 border-dashed bg-muted/30 px-6 text-center text-muted-foreground text-sm">
                    Submit a prompt to generate the first render.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border border-border/80 bg-card/90 shadow-sm backdrop-blur">
              <CardHeader>
                <CardTitle>Generated scene</CardTitle>
                <CardDescription>
                  Inspect the exact `VideoDescription` returned by the prompt
                  flow.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-md border border-border/70 bg-background/80">
                  <pre className="max-h-[32rem] overflow-auto p-4 font-mono text-[12px] text-foreground/90 leading-6">
                    {latestSuccess
                      ? JSON.stringify(
                          latestSuccess.scene,
                          null,
                          SCENE_JSON_INDENTATION
                        )
                      : "The generated scene JSON will appear here after a successful request."}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
