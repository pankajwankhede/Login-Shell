We identified the deployment problem.

vite.config.ts currently has:

server.proxy:
  /api -> shell-sso-service
  /login/ssoAuthenticate -> shell-sso-service

This works only for the Vite development server.

It does NOT proxy requests after the generated dist folder is deployed to PCF Staticfile/nginx.

Production network confirms:

shell-sso-ui.../api/auth/bootstrap/{requestId}
returns:
200 text/html from nginx

Therefore do not try to solve the PCF issue by changing only vite.config.ts.

Analyze:

1. where SsoApiClient is instantiated in the shell
2. whether SsoApiClient receives baseURL
3. existing .env files
4. Jenkins/build-time environment handling
5. whether the application uses build-time VITE_* variables or runtime configuration
6. whether the same dist artifact is promoted between DEV/QA/UAT/PROD

Desired behavior:

LOCAL:
SsoApiClient baseURL = /api/auth
Vite dev proxy routes /api to backend.

DEPLOYED DEV:
SsoApiClient baseURL =
https://shell-sso-service.app.dev1.use1.pcf.syfbank.com/api/auth

DEPLOYED QA/UAT/PROD:
use the corresponding backend URL through the existing environment configuration mechanism.

Do not create another Axios client.
Continue using sso-auth-api-client.

Preserve:
withCredentials: true
xsrfCookieName: XSRF-TOKEN
xsrfHeaderName: X-XSRF-TOKEN

Before making changes, show me exactly how environment values are currently injected at build/runtime and identify the smallest required code/config changes.
