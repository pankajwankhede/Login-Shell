type Args = {
  error: any;

  setUsernameError: (message: string) => void;
  setPasswordError: (message: string) => void;
  setLoginError: (message: string) => void;

  onError: (error: unknown) => void;
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


  // 1. BACKEND FIELD VALIDATION
  if (code === "VALIDATION_ERROR") {

    if (fieldErrors?.username) {
      setUsernameError(
        fieldErrors.username
      );
    }

    if (fieldErrors?.password) {
      setPasswordError(
        fieldErrors.password
      );
    }

    // Validation error without
    // specific field errors
    if (
      !fieldErrors?.username &&
      !fieldErrors?.password
    ) {
      setLoginError(
        typeof message === "string"
          ? message
          : "Please check your information."
      );
    }

    return;
  }


  // 2. INVALID CREDENTIALS
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


  // 3. ACCOUNT LOCKED
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


  // 4. SYSTEM / SERVICE ERROR
  onError(error);
}
