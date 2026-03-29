import { CircleHelp } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RenderVideoResponse } from "@/lib/types/prompt-to-video";
import type { VideoDescription } from "@/lib/types/video";

interface MetaCardProps {
  label: string;
  tooltip: string;
  value: string;
}

function MetaCard({ label, value, tooltip }: MetaCardProps) {
  return (
    <Card className="gap-0 rounded-sm dark:gap-0 dark:bg-background" size="sm">
      <CardHeader>
        <CardTitle className="font-mono text-muted-foreground text-xs uppercase">
          {label}
        </CardTitle>
        <CardAction>
          <Tooltip>
            <TooltipTrigger>
              <CircleHelp className="size-3 text-muted-foreground" />
              <span className="sr-only">About {label}</span>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        </CardAction>
      </CardHeader>
      <CardContent className="text-sm">{value}</CardContent>
    </Card>
  );
}

interface VideoResultProps {
  inferenceMs: number | null;
  scene: VideoDescription;
  video: RenderVideoResponse;
}

function formatTiming(ms: number | null): string {
  if (ms === null) {
    return "n/a";
  }

  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }

  return `${Math.round(ms)}ms`;
}

function totalMs(
  inferenceMs: number | null,
  renderMs: number,
  encodeMs: number
): number | null {
  if (inferenceMs === null) {
    return null;
  }
  return inferenceMs + renderMs + encodeMs;
}

export function VideoResult({ inferenceMs, scene, video }: VideoResultProps) {
  const total = totalMs(
    inferenceMs,
    video.timings.renderMs,
    video.timings.encodeMs
  );

  return (
    <div className="flex flex-col gap-4">
      {video.url ? (
        // biome-ignore lint/a11y/useMediaCaption: generated video preview
        <video
          className="aspect-video w-full rounded-md border border-border/60 bg-muted/20 object-cover"
          controls
          src={video.url}
        />
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-md border border-border/60 border-dashed text-muted-foreground text-xs">
          Render finished without a preview URL.
        </div>
      )}

      <dl className="grid grid-cols-3 gap-2">
        <MetaCard
          label="Total time"
          tooltip="End-to-end time from inference through encode."
          value={formatTiming(total)}
        />
        <MetaCard
          label="Frames"
          tooltip="Total number of frames rendered and the playback frame rate."
          value={`${video.frameCount} at ${video.fps} fps`}
        />
        <MetaCard
          label="Size"
          tooltip="Output resolution of the video in pixels."
          value={`${scene.width} × ${scene.height}`}
        />
        <MetaCard
          label="Inference time"
          tooltip="Time spent generating the scene JSON from your prompt."
          value={formatTiming(inferenceMs)}
        />
        <MetaCard
          label="Render time"
          tooltip="Time spent drawing each frame of the animation."
          value={formatTiming(video.timings.renderMs)}
        />
        <MetaCard
          label="Encode time"
          tooltip="Time spent compressing frames into the final video file."
          value={formatTiming(video.timings.encodeMs)}
        />
      </dl>
    </div>
  );
}
