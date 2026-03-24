import { NextResponse } from "next/server";

import {
  toVideoRenderErrorResponse,
  VideoRenderError,
} from "@/lib/video/errors";
import { renderVideo } from "@/lib/video/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const requestBody = await request.json();
    const renderResult = await renderVideo(requestBody);

    return NextResponse.json({
      codec: renderResult.codec,
      filePath: renderResult.filePath,
      fps: renderResult.fps,
      frameCount: renderResult.frameCount,
      jobId: renderResult.jobId,
      url: renderResult.publicUrl,
    });
  } catch (error) {
    if (error instanceof VideoRenderError) {
      return NextResponse.json(toVideoRenderErrorResponse(error), {
        status: error.status,
      });
    }

    if (error instanceof Error) {
      const renderError = new VideoRenderError("RENDER_ERROR", error.message);

      return NextResponse.json(toVideoRenderErrorResponse(renderError), {
        status: renderError.status,
      });
    }

    const renderError = new VideoRenderError(
      "RENDER_ERROR",
      "The render request failed unexpectedly."
    );

    return NextResponse.json(toVideoRenderErrorResponse(renderError), {
      status: renderError.status,
    });
  }
}
