import type {
  ApiError,
  ErrorCode,
} from "@company/sso-auth-core";

export function handleServiceError(
  error: any
): ApiError {

  const status =
    error?.response?.status;

  const data =
    error?.response?.data;

  const backendMessage =
    typeof data?.message === "string"
      ? data.message
      : undefined;

  const trackingId =
    typeof data?.trackingId === "string"
      ? data.trackingId
      : undefined;


  if (!error?.response) {
    return {
      code: "NETWORK_ERROR",
      message:
        "Unable to connect to the service. Please try again.",
      trackingId,
    };
  }


  if (status === 403) {
    return {
      status,
      code: "ACCESS_DENIED",
      message:
        backendMessage ||
        "You are not authorized to perform this action.",
      trackingId,
    };
  }


  if (
    status === 502 ||
    status === 503
  ) {
    return {
      status,
      code: "SERVICE_UNAVAILABLE",
      message:
        backendMessage ||
        "Service is temporarily unavailable. Please try again.",
      trackingId,
    };
  }


  if (status >= 500) {
    return {
      status,
      code: "INTERNAL_ERROR",
      message:
        backendMessage ||
        "Something went wrong. Please try again.",
      trackingId,
    };
  }


  return {
    status,
    code:
      (typeof data?.code === "string"
        ? data.code
        : "INTERNAL_ERROR") as ErrorCode,

    message:
      backendMessage ||
      "Something went wrong. Please try again.",

    trackingId,
  };
}

===============================================
  const [serverError, setServerError] =
  useState<ApiError | null>(null);

if (serverError) {
  return (
    <ServiceError
      error={serverError}
      onRetry={() => {
        setServerError(null);
      }}
    />
  );
}
