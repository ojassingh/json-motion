export const ERROR_MESSAGES = {
  ASSET_LOAD_ERROR: "Unable to load the requested asset.",
  CONFIGURATION_ERROR: "The app is not configured correctly.",
  DEPENDENCY_ERROR: "A required dependency is unavailable.",
  ENCODER_ERROR: "Video encoding failed.",
  GENERATION_ERROR: "AI scene generation failed.",
  INTERNAL_ERROR: "Something went wrong.",
  RENDER_ERROR: "Video rendering failed.",
  STORAGE_ERROR: "Unable to prepare video output.",
  VALIDATION_ERROR: "Request validation failed.",
} as const;

const ERROR_STATUSES = {
  ASSET_LOAD_ERROR: 422,
  CONFIGURATION_ERROR: 500,
  DEPENDENCY_ERROR: 500,
  ENCODER_ERROR: 500,
  GENERATION_ERROR: 502,
  INTERNAL_ERROR: 500,
  RENDER_ERROR: 500,
  STORAGE_ERROR: 500,
  VALIDATION_ERROR: 400,
} as const;

export type AppErrorCode = keyof typeof ERROR_MESSAGES;

export interface AppErrorOptions {
  cause?: Error;
  details?: string[];
  message?: string;
  status?: number;
}

export interface AppErrorResponse {
  error: {
    code: AppErrorCode;
    details: string[];
    message: string;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getUniqueDetails = (details: string[]): string[] => [
  ...new Set(details.map((detail) => detail.trim()).filter(Boolean)),
];

const getMessageFromRecord = (
  value: Record<string, unknown>
): string | undefined => {
  const code = value.code;

  if (typeof code === "string" && isAppErrorCode(code)) {
    return ERROR_MESSAGES[code];
  }

  const message = value.message;
  if (typeof message === "string" && message.trim().length > 0) {
    return message;
  }

  return undefined;
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details: string[];
  readonly status: number;

  constructor(code: AppErrorCode, options: AppErrorOptions = {}) {
    const message = options.message ?? ERROR_MESSAGES[code];

    if (options.cause) {
      super(message, { cause: options.cause });
    } else {
      super(message);
    }

    this.name = "AppError";
    this.code = code;
    this.details = getUniqueDetails(options.details ?? []);
    this.status = options.status ?? ERROR_STATUSES[code];
  }
}

export const isAppErrorCode = (value: string): value is AppErrorCode =>
  value in ERROR_MESSAGES;

export const isAppErrorResponse = (
  value: unknown
): value is AppErrorResponse => {
  if (!isRecord(value)) {
    return false;
  }

  const error = value.error;
  if (!isRecord(error)) {
    return false;
  }

  return (
    typeof error.code === "string" &&
    isAppErrorCode(error.code) &&
    typeof error.message === "string" &&
    Array.isArray(error.details) &&
    error.details.every((detail) => typeof detail === "string")
  );
};

export const createValidationError = (
  message: string,
  details: string[]
): AppError =>
  new AppError("VALIDATION_ERROR", {
    details,
    message,
  });

export const toAppError = (
  error: unknown,
  code: AppErrorCode,
  options: Omit<AppErrorOptions, "cause"> = {}
): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  const details = [...(options.details ?? [])];

  if (error instanceof Error && error.message.trim().length > 0) {
    details.push(error.message);
  }

  return new AppError(code, {
    ...options,
    cause: error instanceof Error ? error : undefined,
    details,
  });
};

export const toAppErrorResponse = (error: AppError): AppErrorResponse => ({
  error: {
    code: error.code,
    details: error.details,
    message: error.message,
  },
});

export const getErrorMessage = (
  error: unknown,
  fallbackMessage = ERROR_MESSAGES.INTERNAL_ERROR
): string => {
  if (error instanceof AppError) {
    return error.message;
  }

  if (typeof error === "string") {
    return isAppErrorCode(error) ? ERROR_MESSAGES[error] : error;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (!isRecord(error)) {
    return fallbackMessage;
  }

  const nestedError = error.error;
  if (isRecord(nestedError)) {
    const nestedMessage = getMessageFromRecord(nestedError);
    if (nestedMessage) {
      return nestedMessage;
    }
  }

  return getMessageFromRecord(error) ?? fallbackMessage;
};
