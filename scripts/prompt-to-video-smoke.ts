import { generateSceneJson } from "../lib/actions/ai";
import { renderVideo } from "../lib/video/render-video";

const SAMPLE_PROMPT = "a simple square that fades in and turns round and round";

const runPromptToVideoSmoke = async (): Promise<void> => {
  console.log(`Prompt: ${SAMPLE_PROMPT}`);

  const scene = await generateSceneJson(SAMPLE_PROMPT);

  console.log("Generated scene:");
  console.log(JSON.stringify(scene, null, 2));

  const renderResult = await renderVideo(scene);

  console.log(`Rendered video to ${renderResult.filePath}`);

  if (renderResult.publicUrl) {
    console.log(`Open ${renderResult.publicUrl} to preview the MP4.`);
  }
};

await runPromptToVideoSmoke();
