import type {
  ApiError,
} from "@company/sso-auth-core";


type Props = {
  error: ApiError;
  onRetry?: () => void;
};


export function ServiceError({
  error,
  onRetry,
}: Props) {

  const message =
    typeof error?.message === "string"
      ? error.message
      : "Something went wrong. Please try again.";


  const trackingId =
    typeof error?.trackingId === "string"
      ? error.trackingId
      : undefined;


  return (

    <div role="alert">

      <h2>
        Unable to continue
      </h2>


      <p>
        {message}
      </p>


      {trackingId && (

        <p>
          Reference ID: {trackingId}
        </p>

      )}


      {onRetry && (

        <button
          type="button"
          onClick={onRetry}
        >
          Try Again
        </button>

      )}

    </div>
  );
}
