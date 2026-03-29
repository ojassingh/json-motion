"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PROMPT_SUGGESTIONS } from "@/lib/constants";
import { MAX_PROMPT_LENGTH } from "@/lib/types/prompt-to-video";
import { cn } from "@/lib/utils";
import { usePlayground } from "./context";

export function PromptInput() {
  const { prompt, setPrompt, phase, generations, selectedId, onSubmit } =
    usePlayground();
  const isLoading = phase !== "idle";

  return (
    <aside className="flex w-96 shrink-0 flex-col border-r">
      <div className="flex h-9 items-center border-b px-3">
        <span className="font-mono text-muted-foreground text-xs">
          prompt input
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {generations.length === 0 ? (
          <div className="mt-40 flex flex-col gap-1.5 p-2.5 text-center">
            <p className="mt-4 mb-2 text-muted-foreground text-sm">
              Choose a simple text-and-shape scene to generate
            </p>
            {PROMPT_SUGGESTIONS.map((s) => (
              <button
                className="rounded border bg-background p-2 text-left text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground"
                key={s}
                onClick={() => setPrompt(s)}
                type="button"
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-2 p-1.5">
            {generations.map((g) => (
              <li key={g.id}>
                <div
                  className={cn(
                    "rounded border bg-background p-2 text-muted-foreground text-xs",
                    selectedId !== g.id && "text-muted-foreground"
                  )}
                >
                  <span className="line-clamp-2 leading-relaxed">
                    {g.prompt}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form className="border-t p-2" onSubmit={onSubmit}>
        <div className="relative">
          <Textarea
            className="h-32 border-0 bg-background dark:bg-background"
            disabled={isLoading}
            maxLength={MAX_PROMPT_LENGTH}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !isLoading &&
                prompt.trim()
              ) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Describe a simple text-and-shape motion scene..."
            rows={3}
            value={prompt}
          />
          <Button
            aria-label="Generate"
            className="absolute right-1.5 bottom-1.5 my-2 rounded-full"
            disabled={isLoading || !prompt.trim()}
            size="icon"
            type="submit"
          >
            {isLoading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <ArrowRight className="size-5" />
            )}
          </Button>
        </div>
      </form>
    </aside>
  );
}
