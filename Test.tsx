async initCsrf(): Promise<void> {
  const response = await this.c.get<{
    parameterName: string;
    headerName: string;
    token: string;
  }>("/csrf");

  this.c.defaults.headers.common[
    response.data.headerName
  ] = response.data.token;
}


constructor(baseURL = "/api/auth") {
  this.c = axios.create({
    baseURL,
    withCredentials: true,
    xsrfCookieName: "XSRF-TOKEN",
    xsrfHeaderName: "X-XSRF-TOKEN",
  });
}


async function startApp() {
  const apiBaseUrl =
    window.__SSO_CONFIG__?.apiBaseUrl ?? "/api/auth";

  const ssoApi =
    new SsoApiClient(apiBaseUrl);

  await ssoApi.initCsrf();

  createRoot(
    document.getElementById("root")!
  ).render(
    <App api={ssoApi} />
  );
}

startApp();
