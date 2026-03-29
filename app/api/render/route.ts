import { NextResponse } from "next/server";

import {
  createValidationError,
  toAppError,
  toAppErrorResponse,
} from "@/lib/errors";
import { renderVideo } from "@/lib/video/render-video";

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
      timings: renderResult.timings,
      url: renderResult.publicUrl,
    });
  } catch (error) {
    const appError =
      error instanceof SyntaxError
        ? createValidationError("Render request validation failed.", [
            "Request body must be valid JSON.",
          ])
        : toAppError(error, "INTERNAL_ERROR", {
            message: "The render request failed unexpectedly.",
          });

    if (appError.status >= 500) {
      console.error("POST /api/render failed", {
        code: appError.code,
        details: appError.details,
        message: appError.message,
        status: appError.status,
      });
    }

    return NextResponse.json(toAppErrorResponse(appError), {
      status: appError.status,
    });
  }
}
