import { sampleVideoDescription } from "../lib/video/fixtures/sample-video-description";
import { renderVideo } from "../lib/video/service";

const renderFixture = async (): Promise<void> => {
  const renderResult = await renderVideo(sampleVideoDescription);

  console.log(`Rendered fixture to ${renderResult.filePath}`);

  if (renderResult.publicUrl) {
    console.log(`Open ${renderResult.publicUrl} to preview the MP4.`);
  }
};

await renderFixture();
