import { ZodError } from "zod";

export type VideoRenderErrorCode =
  | "ASSET_LOAD_ERROR"
  | "DEPENDENCY_ERROR"
  | "ENCODER_ERROR"
  | "RENDER_ERROR"
  | "STORAGE_ERROR"
  | "VALIDATION_ERROR";

export class VideoRenderError extends Error {
  readonly code: VideoRenderErrorCode;
  readonly details: string[];
  readonly status: number;

  constructor(
    code: VideoRenderErrorCode,
    message: string,
    options?: {
      cause?: Error;
      details?: string[];
      status?: number;
    }
  ) {
    super(message, { cause: options?.cause });

    this.name = "VideoRenderError";
    this.code = code;
    this.status = options?.status ?? 500;
    this.details = options?.details ?? [];
  }
}

export interface VideoRenderErrorResponse {
  error: {
    code: VideoRenderErrorCode;
    details: string[];
    message: string;
  };
}

export const toVideoRenderError = (
  error: Error | VideoRenderError | ZodError
): VideoRenderError => {
  if (error instanceof VideoRenderError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new VideoRenderError(
      "VALIDATION_ERROR",
      "Render request validation failed.",
      {
        details: error.issues.map((issue) => issue.message),
        status: 400,
      }
    );
  }

  return new VideoRenderError("RENDER_ERROR", error.message);
};

export const toVideoRenderErrorResponse = (
  error: VideoRenderError
): VideoRenderErrorResponse => ({
  error: {
    code: error.code,
    details: error.details,
    message: error.message,
  },
});
