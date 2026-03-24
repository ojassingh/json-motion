import { NextResponse } from "next/server";

import {
  createPromptValidationError,
  PromptToVideoError,
  toPromptToVideoErrorResponse,
} from "@/lib/prompt-to-video/errors";
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
    if (error instanceof SyntaxError) {
      const validationError = createPromptValidationError([
        "Request body must be valid JSON.",
      ]);

      return NextResponse.json(toPromptToVideoErrorResponse(validationError), {
        status: validationError.status,
      });
    }

    if (error instanceof PromptToVideoError) {
      return NextResponse.json(toPromptToVideoErrorResponse(error), {
        status: error.status,
      });
    }

    if (error instanceof Error) {
      const promptToVideoError = new PromptToVideoError(
        "GENERATION_ERROR",
        "Prompt-to-video request failed unexpectedly.",
        {
          cause: error,
          details: [error.message],
          status: 500,
        }
      );

      return NextResponse.json(
        toPromptToVideoErrorResponse(promptToVideoError),
        {
          status: promptToVideoError.status,
        }
      );
    }

    const promptToVideoError = new PromptToVideoError(
      "GENERATION_ERROR",
      "Prompt-to-video request failed unexpectedly.",
      {
        status: 500,
      }
    );

    return NextResponse.json(toPromptToVideoErrorResponse(promptToVideoError), {
      status: promptToVideoError.status,
    });
  }
}
