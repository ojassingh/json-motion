import type {
  PromptToVideoErrorCode,
  PromptToVideoErrorResponse,
} from "@/lib/types/prompt-to-video";

export class PromptToVideoError extends Error {
  readonly code: PromptToVideoErrorCode;
  readonly details: string[];
  readonly status: number;

  constructor(
    code: PromptToVideoErrorCode,
    message: string,
    options?: {
      cause?: Error;
      details?: string[];
      status?: number;
    }
  ) {
    super(message, { cause: options?.cause });

    this.name = "PromptToVideoError";
    this.code = code;
    this.details = options?.details ?? [];
    this.status = options?.status ?? 500;
  }
}

export const createPromptValidationError = (
  details: string[]
): PromptToVideoError =>
  new PromptToVideoError(
    "VALIDATION_ERROR",
    "Prompt request validation failed.",
    {
      details,
      status: 400,
    }
  );

export const toPromptToVideoErrorResponse = (
  error: PromptToVideoError
): PromptToVideoErrorResponse => ({
  error: {
    code: error.code,
    details: error.details,
    message: error.message,
  },
});
