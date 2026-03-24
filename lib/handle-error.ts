"use client";

import { toast } from "sonner";

import { ERROR_MESSAGES, getErrorMessage } from "@/lib/errors";

export const handleError = (error: unknown): void => {
  toast.error(getErrorMessage(error, ERROR_MESSAGES.INTERNAL_ERROR));
};
