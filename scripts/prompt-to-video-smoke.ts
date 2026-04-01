import { generateSceneJson } from "../lib/actions/ai";

const DEFAULT_PROMPT =
  "a simple square that fades in and turns round and round";
const cliArgs = process.argv.slice(2);
const shouldRender = !cliArgs.includes("--skip-render");
const SAMPLE_PROMPT =
  cliArgs
    .filter((arg) => arg !== "--skip-render")
    .join(" ")
    .trim() || DEFAULT_PROMPT;

const summarizeNodeTypes = (
  nodes: Record<string, { type: string }>
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const node of Object.values(nodes)) {
    counts[node.type] = (counts[node.type] ?? 0) + 1;
  }
  return counts;
};

const runPromptToVideoSmoke = async (): Promise<void> => {
  console.log(`Prompt: ${SAMPLE_PROMPT}`);

  const generationResult = await generateSceneJson(SAMPLE_PROMPT);

  console.log("Generated scene:");
  console.log(JSON.stringify(generationResult.scene, null, 2));
  console.log("Node types by scene:");
  console.log(
    JSON.stringify(
      generationResult.scene.scenes.map((scene) => ({
        id: scene.id,
        nodeTypes: summarizeNodeTypes(scene.nodes),
      })),
      null,
      2
    )
  );

  if (!shouldRender) {
    console.log("Skipping render step.");
    return;
  }

  const { renderVideo } = await import("../lib/video/render-video");
  const renderResult = await renderVideo(generationResult.scene);

  console.log(`Rendered video to ${renderResult.filePath}`);

  if (renderResult.publicUrl) {
    console.log(`Open ${renderResult.publicUrl} to preview the MP4.`);
  }
};

await runPromptToVideoSmoke();
