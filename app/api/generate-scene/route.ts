import { NextResponse } from "next/server";

import { generateVideoDescriptionFromPrompt } from "@/lib/ai/generate-video-description";
import {
  createValidationError,
  toAppError,
  toAppErrorResponse,
} from "@/lib/errors";
import { promptToVideoRequestSchema } from "@/lib/types/prompt-to-video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getPromptFromRequestBody = (
  requestBody: Partial<{ prompt: string }>
): string | undefined =>
  typeof requestBody.prompt === "string" ? requestBody.prompt : undefined;

export async function POST(request: Request): Promise<Response> {
  try {
    const requestBody = (await request.json()) as Partial<{ prompt: string }>;
    const parsedRequest = promptToVideoRequestSchema.safeParse({
      prompt: getPromptFromRequestBody(requestBody),
    });

    if (!parsedRequest.success) {
      throw createValidationError(
        "Prompt request validation failed.",
        parsedRequest.error.issues.map((issue) => issue.message)
      );
    }

    const scene = await generateVideoDescriptionFromPrompt(
      parsedRequest.data.prompt
    );

    return NextResponse.json({ scene });
  } catch (error) {
    const appError =
      error instanceof SyntaxError
        ? createValidationError("Prompt request validation failed.", [
            "Request body must be valid JSON.",
          ])
        : toAppError(error, "INTERNAL_ERROR", {
            message: "Prompt-to-scene request failed unexpectedly.",
          });

    if (appError.status >= 500) {
      console.error("POST /api/generate-scene failed", {
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
