import axios from "axios";

import type {
  ApiError,
  ErrorCode,
} from "@company/sso-auth-core";


export function normalizeApiError(
  error: unknown
): ApiError {

  // ===============================
  // AXIOS ERROR
  // ===============================
  if (axios.isAxiosError(error)) {

    const status =
      error.response?.status;

    const data =
      error.response?.data;


    // Make sure message is ALWAYS STRING
    const backendMessage =
      typeof data?.message === "string"
        ? data.message
        : undefined;


    // Make sure code is string
    const backendCode =
      typeof data?.code === "string"
        ? data.code
        : getErrorCode(status);


    // Make sure trackingId is string
    const trackingId =
      typeof data?.trackingId === "string"
        ? data.trackingId
        : error.response?.headers?.[
            "x-tracking-id"
          ];


    return {

      status,

      code:
        backendCode as ErrorCode,

      message:
        backendMessage ||
        defaultMessage(status),

      trackingId:
        trackingId
          ? String(trackingId)
          : undefined,

      fieldErrors:
        data?.fieldErrors &&
        typeof data.fieldErrors === "object"
          ? data.fieldErrors
          : undefined,
    };
  }


  // ===============================
  // NORMAL JS ERROR
  // ===============================
  if (error instanceof Error) {

    return {
      code: "INTERNAL_ERROR",

      message:
        error.message ||
        "Something went wrong. Please try again.",
    };
  }


  // ===============================
  // UNKNOWN ERROR
  // ===============================
  return {

    code: "INTERNAL_ERROR",

    message:
      "Something went wrong. Please try again.",
  };
}


function getErrorCode(
  status?: number
): ErrorCode {

  if (!status) {
    return "NETWORK_ERROR";
  }

  if (status === 403) {
    return "ACCESS_DENIED";
  }

  if (status === 503) {
    return "SERVICE_UNAVAILABLE";
  }

  return "INTERNAL_ERROR";
}


function defaultMessage(
  status?: number
): string {

  if (!status) {

    return (
      "Unable to connect to the service. " +
      "Please try again."
    );
  }


  if (status === 403) {

    return (
      "You are not authorized " +
      "to perform this action."
    );
  }


  if (
    status === 500 ||
    status === 502 ||
    status === 503
  ) {

    return (
      "Service is temporarily unavailable. " +
      "Please try again."
    );
  }


  return (
    "Something went wrong. " +
    "Please try again."
  );
}
