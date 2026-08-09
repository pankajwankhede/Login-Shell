First create the reusable error UI in sso-ui-components, then wire it into sso-react-shell/App.tsx.

Step 1 — sso-ui-components

Create this file:

import React from "react";

type Props = {
  error: any;
  onRetry?: () => void;
};

export function ServiceError({
  error,
  onRetry,
}: Props) {
  const status = error?.response?.status;

  const backendMessage =
    error?.response?.data?.message;

  const trackingId =
    error?.response?.data?.trackingId;

  let message =
    backendMessage ||
    "Something went wrong. Please try again.";

  if (!error?.response) {
    message =
      "Unable to connect to the service. Please try again.";
  } else if (status === 403) {
    message =
      backendMessage ||
      "You are not authorized to perform this action.";
  } else if (status === 404) {
    message =
      backendMessage ||
      "The requested service could not be found.";
  } else if (
    status === 500 ||
    status === 502 ||
    status === 503
  ) {
    message =
      backendMessage ||
      "Service is temporarily unavailable. Please try again.";
  }

  return (
    <div
      role="alert"
      style={{
        maxWidth: "500px",
        margin: "60px auto",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <h2>Unable to continue</h2>

      <p>{message}</p>

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

export { ServiceError } from "./ServiceError";
step2-:shell-app.js

    import React, {
  lazy,
  Suspense,
  useEffect,
  useState,
} from "react";

import { useParams } from "react-router-dom";

import type {
  ActionResponse,
  BootstrapResponse,
  FlowName,
} from "@company/sso-auth-core";

import { ssoApi } from "@company/sso-auth-api-client";

import {
  PublicLayout,
  AuthenticatedLayout,
  ServiceError,
} from "@company/sso-ui-components";


const flows: Record<
  Exclude<FlowName, "COMPLETE">,
  React.LazyExoticComponent<any>
> = {

  AUTHENTICATE:
    lazy(() =>
      import("@company/sso-flow-authenticate")
    ),

  FORGOT_PASSWORD:
    lazy(() =>
      import("@company/sso-flow-forgot-password")
    ),

  FORGOT_USERNAME:
    lazy(() =>
      import("@company/sso-flow-forgot-username")
    ),

  PASSWORD_EXPIRED:
    lazy(() =>
      import("@company/sso-flow-password-expired")
    ),

  MISSING_PROFILE:
    lazy(() =>
      import("@company/sso-flow-missing-profile")
    ),

  TRANSMIT:
    lazy(() =>
      import("@company/sso-flow-transmit")
    ),
};


export default function App() {

  const { id } = useParams();

  const [bootstrap, setBootstrap] =
    useState<BootstrapResponse>();

  // SYSTEM / SERVICE ERROR
  const [error, setError] =
    useState<any>(null);


  // ==========================================
  // BOOTSTRAP
  // ==========================================
  useEffect(() => {

    if (!id) {
      return;
    }

    ssoApi
      .bootstrap(id)
      .then(setBootstrap)
      .catch((e) => {
        setError(e);
      });

  }, [id]);


  // ==========================================
  // HANDLE FLOW RESPONSE
  // ==========================================
  async function action(
    response: ActionResponse
  ) {

    try {

      // direct redirect
      if (response.redirectUrl) {

        window.location.assign(
          response.redirectUrl
        );

        return;
      }


      // authorization complete
      if (
        response.nextAction === "COMPLETE"
      ) {

        const done =
          await ssoApi.completeAuthorization(
            bootstrap!.requestId
          );

        if (done.redirectUrl) {

          window.location.assign(
            done.redirectUrl
          );
        }

        return;
      }


      // load next step
      const next =
        await ssoApi.bootstrap(
          bootstrap!.requestId
        );

      setBootstrap(next);

    } catch (e) {

      // SYSTEM / SERVICE ERROR
      setError(e);

    }
  }


  // ==========================================
  // SYSTEM / SERVICE ERROR SCREEN
  // ==========================================
  if (error) {

    return (
      <ServiceError

        error={error}

        onRetry={() => {

          setError(null);

          if (!id) {
            return;
          }

          ssoApi
            .bootstrap(id)
            .then(setBootstrap)
            .catch((e) => {
              setError(e);
            });
        }}

      />
    );
  }


  // ==========================================
  // LOADING
  // ==========================================
  if (!bootstrap) {

    return <p>Loading...</p>;
  }


  // ==========================================
  // FIND CURRENT FLOW
  // ==========================================
  const Flow =
    flows[
      bootstrap.nextAction as Exclude<
        FlowName,
        "COMPLETE"
      >
    ];


  // ==========================================
  // FLOW BODY
  // ==========================================
  const body = (

    <Suspense
      fallback={<p>Loading...</p>}
    >

      <Flow

        bootstrap={bootstrap}

        api={ssoApi}

        onAction={action}

        // Any flow system error comes here
        onError={(e: unknown) => {
          setError(e);
        }}

      />

    </Suspense>
  );


  // ==========================================
  // LAYOUT
  // ==========================================
  return bootstrap.layout === "PUBLIC" ? (

    <PublicLayout
      config={bootstrap.uiConfiguration}
    >
      {body}
    </PublicLayout>

  ) : (

    <AuthenticatedLayout
      config={bootstrap.uiConfiguration}
      user={bootstrap.user}
    >
      {body}
    </AuthenticatedLayout>

  );
}

============================================
        Yes. For expected errors like:

Username required
Password required
Invalid credentials
Account locked
OTP invalid/expired

you should handle them inside the flow component, not in Shell App.tsx.

Do it in 2 steps just like system errors.

Step 1 — Create reusable expected error UI in sso-ui-components
Create:

sso-ui-components
└── src
    └── ExpectedError.tsx

Copy-paste:

import React from "react";

type Props = {
  message?: string;
};

export function ExpectedError({
  message,
}: Props) {

  if (!message) {
    return null;
  }

  return (
    <div
      role="alert"
      style={{
        marginTop: "8px",
        marginBottom: "12px",
        color: "#b00020",
      }}
    >
      {message}
    </div>
  );
}

Then export it from:

sso-ui-components/src/index.ts

Add:

export { ExpectedError } from "./ExpectedError";
Step 2 — Change sso-flow-authenticate

Update:

sso-flow-authenticate
└── src
    └── index.tsx

    import React, {
  useState,
} from "react";

import type {
  FlowProps,
} from "@company/sso-auth-core";

import {
  ExpectedError,
} from "@company/sso-ui-components";


export function AuthenticateFlow({
  bootstrap,
  api,
  onAction,
  onError,
}: FlowProps) {

  const [username, setUsername] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [rememberMe, setRememberMe] =
    useState(false);


  // EXPECTED ERRORS
  const [usernameError, setUsernameError] =
    useState("");

  const [passwordError, setPasswordError] =
    useState("");

  const [loginError, setLoginError] =
    useState("");


  // ======================================
  // LOGIN SUBMIT
  // ======================================
  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>
  ) {

    e.preventDefault();

    // Clear old errors
    setUsernameError("");
    setPasswordError("");
    setLoginError("");

    let hasError = false;


    // ======================================
    // USERNAME VALIDATION
    // ======================================
    if (!username.trim()) {

      setUsernameError(
        "Username is required."
      );

      hasError = true;
    }


    // ======================================
    // PASSWORD VALIDATION
    // ======================================
    if (!password.trim()) {

      setPasswordError(
        "Password is required."
      );

      hasError = true;
    }


    // Do not call backend
    if (hasError) {
      return;
    }


    try {

      const response =
        await api.authenticate({
          requestId:
            bootstrap.requestId,

          username:
            username.trim(),

          password,

          rememberMe,
        });


      onAction(response);

    } catch (e: any) {

      const status =
        e?.response?.status;

      const code =
        e?.response?.data?.code;

      const message =
        e?.response?.data?.message;


      // ======================================
      // EXPECTED LOGIN ERROR
      // ======================================
      if (
        status === 401 ||
        code === "INVALID_CREDENTIALS"
      ) {

        setLoginError(
          message ||
          "Username or password is incorrect."
        );

        return;
      }


      // ACCOUNT LOCKED
      if (
        status === 423 ||
        code === "ACCOUNT_LOCKED"
      ) {

        setLoginError(
          message ||
          "Your account is locked."
        );

        return;
      }


      // SYSTEM ERROR
      // Send to shell
      onError(e);
    }
  }


  return (

    <form
      onSubmit={handleSubmit}
    >

      <h1>
        {
          bootstrap
            .uiConfiguration
            .headerTitle
        }
      </h1>


      {/* USERNAME */}
      <label>

        Username

        <input
          value={username}

          onChange={(e) => {

            setUsername(
              e.target.value
            );

            setUsernameError("");
            setLoginError("");
          }}
        />

      </label>


      <ExpectedError
        message={usernameError}
      />


      {/* PASSWORD */}
      <label>

        Password

        <input
          type="password"

          value={password}

          onChange={(e) => {

            setPassword(
              e.target.value
            );

            setPasswordError("");
            setLoginError("");
          }}
        />

      </label>


      <ExpectedError
        message={passwordError}
      />


      {/* LOGIN BUSINESS ERROR */}
      <ExpectedError
        message={loginError}
      />


      {/* REMEMBER ME */}
      {
        bootstrap
          .features
          .rememberMe && (

          <label>

            <input
              type="checkbox"

              checked={rememberMe}

              onChange={(e) =>
                setRememberMe(
                  e.target.checked
                )
              }
            />

            Remember me

          </label>
        )
      }


      {/* SIGN IN */}
      <button
        type="submit"
      >
        Sign in
      </button>


      {/* FORGOT PASSWORD */}
      {
        bootstrap
          .features
          .forgotPassword && (

          <button
            type="button"

            onClick={async () => {

              try {

                const response =
                  await api.selectFlow(
                    bootstrap.requestId,
                    "FORGOT_PASSWORD"
                  );

                onAction(response);

              } catch (e) {

                onError(e);
              }
            }}
          >
            Forgot password
          </button>
        )
      }


      {/* FORGOT USERNAME */}
      {
        bootstrap
          .features
          .forgotUsername && (

          <button
            type="button"

            onClick={async () => {

              try {

                const response =
                  await api.selectFlow(
                    bootstrap.requestId,
                    "FORGOT_USERNAME"
                  );

                onAction(response);

              } catch (e) {

                onError(e);
              }
            }}
          >
            Forgot username
          </button>
        )
      }

    </form>
  );
}


export default AuthenticateFlow;

EXPECTED ERRORS
-----------------------------
Username required
Password required
Invalid credentials
Account locked
OTP invalid
OTP expired
        ↓
Flow component
        ↓
<ExpectedError />
        ↓
Same page


SYSTEM ERRORS
-----------------------------
403
500
502
503
Network failure
Unexpected error
        ↓
onError(error)
        ↓
Shell App.tsx
        ↓
<ServiceError />

 ===============
sso-ui-components
   ├── ExpectedError.tsx
   └── ServiceError.tsx

sso-flow-authenticate
   └── Uses ExpectedError

sso-react-shell
   └── Uses ServiceError            
