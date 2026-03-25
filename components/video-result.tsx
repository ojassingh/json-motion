import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { RenderVideoResponse } from "@/lib/types/prompt-to-video";
import type { VideoDescription } from "@/lib/types/video";

interface MetaCardProps {
  label: string;
  value: string;
}

function MetaCard({ label, value }: MetaCardProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-mono text-[10px] uppercase tracking-widest">
          {label}
        </CardTitle>
        <CardDescription className="truncate font-mono text-xs">
          {value}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

interface VideoResultProps {
  scene: VideoDescription;
  video: RenderVideoResponse;
}

export function VideoResult({ scene, video }: VideoResultProps) {
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

      <dl className="grid grid-cols-2 gap-2">
        <MetaCard label="Job" value={video.jobId} />
        <MetaCard label="Codec" value={video.codec} />
        <MetaCard
          label="Frames"
          value={`${video.frameCount} at ${video.fps} fps`}
        />
        <MetaCard label="Size" value={`${scene.width} × ${scene.height}`} />
      </dl>
    </div>
  );
}
