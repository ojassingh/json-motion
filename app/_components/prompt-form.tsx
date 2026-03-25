"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PROMPT_SUGGESTIONS } from "@/lib/constants";
import { MAX_PROMPT_LENGTH } from "@/lib/types/prompt-to-video";
import { useHome } from "./context";

export function PromptForm() {
  const promptFieldId = useId();
  const { prompt, setPrompt, phase, onSubmit } = useHome();
  const isSubmitting = phase !== "idle";

  return (
    <div className="w-full" id="examples">
      <form className="flex flex-col items-center gap-3" onSubmit={onSubmit}>
        <div className="relative flex w-full items-center">
          <label className="sr-only" htmlFor={promptFieldId}>
            Scene prompt
          </label>
          <Input
            className="h-12 pr-14 font-mono"
            disabled={isSubmitting}
            id={promptFieldId}
            maxLength={MAX_PROMPT_LENGTH}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the motion you want to generate..."
            value={prompt}
          />
          <Button
            aria-label="Generate video"
            className="absolute right-2 size-8 rounded-full"
            disabled={isSubmitting || !prompt.trim()}
            size="icon"
            type="submit"
          >
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowRight className="size-4" />
            )}
          </Button>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {PROMPT_SUGGESTIONS.map((s) => (
            <Button
              className="rounded-full"
              disabled={isSubmitting}
              key={s}
              onClick={() => setPrompt(s)}
              size="sm"
              type="button"
              variant="outline"
            >
              {s}
            </Button>
          ))}
        </div>
      </form>
    </div>
  );
}
