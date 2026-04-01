import "server-only";

import { AppError, isAppErrorResponse, toAppError } from "@/lib/errors";
import type { VideoDescription, VideoTimingMetrics } from "@/lib/types/video";
import {
  getModalRenderEndpoint,
  getModalRenderToken,
  MODAL_RENDER_TIMEOUT_MS,
} from "@/lib/video/config";

interface ModalRenderRequest {
  codec: string;
  jobId: string;
  objectKey: string;
  scene: VideoDescription;
}

interface ModalRenderResponse {
  codec: string;
  filePath: string;
  jobId: string;
  publicUrl: string;
  timings: VideoTimingMetrics;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isTimingMetrics = (value: unknown): value is VideoTimingMetrics =>
  isRecord(value) &&
  typeof value.encodeMs === "number" &&
  typeof value.renderMs === "number";

const isModalRenderResponse = (value: unknown): value is ModalRenderResponse =>
  isRecord(value) &&
  typeof value.codec === "string" &&
  typeof value.filePath === "string" &&
  typeof value.jobId === "string" &&
  typeof value.publicUrl === "string" &&
  isTimingMetrics(value.timings);

const parseModalErrorDetails = (payload: unknown): string[] => {
  if (isAppErrorResponse(payload)) {
    return payload.error.details;
  }

  if (!isRecord(payload)) {
    return [];
  }

  const detail = payload.detail;

  if (typeof detail === "string") {
    return [detail];
  }

  if (Array.isArray(detail)) {
    return detail.filter((item): item is string => typeof item === "string");
  }

  if (isRecord(detail)) {
    const details = detail.details;
    if (Array.isArray(details)) {
      return details.filter((item): item is string => typeof item === "string");
    }

    const message = detail.message;
    if (typeof message === "string" && message.trim().length > 0) {
      return [message];
    }
  }

  return [];
};

const readJsonResponse = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export const renderVideoWithModal = async (
  request: ModalRenderRequest
): Promise<ModalRenderResponse> => {
  const endpoint = getModalRenderEndpoint();

  if (!endpoint) {
    throw new AppError("CONFIGURATION_ERROR", {
      message: "MODAL_RENDER_ENDPOINT must be set for modal rendering.",
    });
  }

  const headers: HeadersInit = {
    "content-type": "application/json",
  };
  const token = getModalRenderToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;

  try {
    response = await fetch(endpoint, {
      body: JSON.stringify(request),
      cache: "no-store",
      headers,
      method: "POST",
      signal: AbortSignal.timeout(MODAL_RENDER_TIMEOUT_MS),
    });
  } catch (error) {
    throw toAppError(error, "RENDER_ERROR", {
      message: "Modal render request failed.",
    });
  }

  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const details = parseModalErrorDetails(payload);

    throw new AppError("RENDER_ERROR", {
      details:
        details.length > 0
          ? details
          : [`Modal render endpoint returned HTTP ${response.status}.`],
      message: "Modal render request failed.",
      status: response.status,
    });
  }

  if (!isModalRenderResponse(payload)) {
    throw new AppError("RENDER_ERROR", {
      message: "Modal render response was invalid.",
    });
  }

  return payload;
};
