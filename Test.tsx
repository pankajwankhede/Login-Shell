type Args = {
  error: any;

  setUsernameError:
    (message: string) => void;

  setPasswordError:
    (message: string) => void;

  setLoginError:
    (message: string) => void;

  onError:
    (error: unknown) => void;
};


export function handleAuthenticateError({
  error,
  setUsernameError,
  setPasswordError,
  setLoginError,
  onError,
}: Args): void {

  const status =
    error?.response?.status;

  const data =
    error?.response?.data;

  const code =
    data?.code;

  const message =
    data?.message;

  const fieldErrors =
    data?.fieldErrors;


  // ==========================
  // VALIDATION ERROR
  // ==========================
  if (code === "VALIDATION_ERROR") {

    if (Array.isArray(fieldErrors)) {

      const usernameError =
        fieldErrors.find(
          (item) =>
            item.field === "username"
        );

      const passwordError =
        fieldErrors.find(
          (item) =>
            item.field === "password"
        );


      if (usernameError) {
        setUsernameError(
          usernameError.message
        );
      }


      if (passwordError) {
        setPasswordError(
          passwordError.message
        );
      }


      // No field-specific error
      if (
        !usernameError &&
        !passwordError
      ) {

        setLoginError(
          typeof message === "string"
            ? message
            : "Please check your information."
        );
      }
    }

    return;
  }


  // ==========================
  // INVALID CREDENTIALS
  // ==========================
  if (
    status === 401 ||
    code === "INVALID_CREDENTIALS"
  ) {

    setLoginError(
      typeof message === "string"
        ? message
        : "Username or password is incorrect."
    );

    return;
  }


  // ==========================
  // ACCOUNT LOCKED
  // ==========================
  if (
    status === 423 ||
    code === "ACCOUNT_LOCKED"
  ) {

    setLoginError(
      typeof message === "string"
        ? message
        : "Your account is locked."
    );

    return;
  }


  // ==========================
  // SYSTEM ERROR -> SHELL
  // ==========================
  onError(error);
}

=======
  export interface FieldError {
  field: string;
  message: string;
}

export interface ApiError {
  status?: number;
  code: ErrorCode;
  message: string;
  trackingId?: string;

  fieldErrors?: FieldError[];
}
