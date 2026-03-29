import type {
  PromptToVideoSceneResponse,
  RenderVideoResponse,
} from "@/lib/types/prompt-to-video";
import type { VideoDescription } from "@/lib/types/video";

function post(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

export async function generateScene(prompt: string): Promise<VideoDescription> {
  const result = await generateSceneWithMetadata(prompt);
  return result.scene;
}

export async function generateSceneWithMetadata(
  prompt: string
): Promise<PromptToVideoSceneResponse> {
  const res = await post("/api/generate-scene", { prompt });
  const data: PromptToVideoSceneResponse = await res.json();
  if (!res.ok) {
    throw data;
  }
  return data;
}

export async function renderVideo(
  scene: VideoDescription
): Promise<RenderVideoResponse> {
  const res = await post("/api/render", scene);
  const data: RenderVideoResponse = await res.json();
  if (!res.ok) {
    throw data;
  }
  return data;
}
