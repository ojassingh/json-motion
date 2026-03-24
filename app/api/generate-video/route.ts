import { NextResponse } from "next/server";

import {
  createValidationError,
  toAppError,
  toAppErrorResponse,
} from "@/lib/errors";
import { generateVideoFromPrompt } from "@/lib/prompt-to-video/generate-video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getPromptFromRequestBody = (
  requestBody: Partial<{ prompt: string }>
): string | undefined =>
  typeof requestBody.prompt === "string" ? requestBody.prompt : undefined;

export async function POST(request: Request): Promise<Response> {
  try {
    const requestBody = (await request.json()) as Partial<{ prompt: string }>;
    const response = await generateVideoFromPrompt({
      prompt: getPromptFromRequestBody(requestBody),
    });

    return NextResponse.json(response);
  } catch (error) {
    const appError =
      error instanceof SyntaxError
        ? createValidationError("Prompt request validation failed.", [
            "Request body must be valid JSON.",
          ])
        : toAppError(error, "INTERNAL_ERROR", {
            message: "Prompt-to-video request failed unexpectedly.",
          });

    return NextResponse.json(toAppErrorResponse(appError), {
      status: appError.status,
    });
  }
}
