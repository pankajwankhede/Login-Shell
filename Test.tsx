const defaultUiConfig = {
  pageTitle: "Secure Login",
  logoUrl: "/logo.svg",
  logoAlt: "Company",
  headerTitle: "Secure Login",
  headerLinks: [],
  footerLinks: [],
  approvedScriptIds: [],
};

Then:

if (!b && serverError) {

  return (
    <PublicLayout
      config={defaultUiConfig}
    >
      <ServiceError
        error={serverError}
      />
    </PublicLayout>
  );
}

================
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

  const code =
    typeof data?.code === "string"
      ? data.code
      : "INTERNAL_ERROR";

  const message =
    typeof data?.message === "string"
      ? data.message
      : "Something went wrong. Please try again.";

  return {
    status,
    code: code as ErrorCode,
    message,
    trackingId:
      typeof data?.trackingId === "string"
        ? data.trackingId
        : undefined,
  };
}
