We are currently testing directly on PCF before implementing production Nginx routing.

Frontend PCF URL:
https://shell-sso-ui.app.dev1.use1.pcf.syfbank.com

Backend PCF URL:
https://shell-sso-service.app.dev1.use1.pcf.syfbank.com

The frontend uses staticfile_buildpack with:

path: ./dist

Therefore the Vite server.proxy configuration is LOCAL DEVELOPMENT ONLY and is not available after cf push.

Do not modify vite.config.ts as the production fix.

Current deployed problem:

GET /api/auth/csrf
and
GET /api/auth/bootstrap/{requestId}

are going to shell-sso-ui and returning text/html from nginx.

They need to go directly to:

https://shell-sso-service.app.dev1.use1.pcf.syfbank.com/api/auth/csrf

and:

https://shell-sso-service.app.dev1.use1.pcf.syfbank.com/api/auth/bootstrap/{requestId}

The project already has sso-auth-api-client with SsoApiClient.

Do not create another Axios client.

First inspect the Shell App and identify:

1. where SsoApiClient is instantiated
2. whether baseURL is passed to it
3. how public/config.js is generated and consumed
4. the contents/schema of runtime config.js
5. whether an existing backend/api URL configuration already exists
6. whether import.meta.env is currently used
7. how the AuthApi instance is passed into App.tsx

Prefer using the existing runtime config.js mechanism if it already exists.

The target should be conceptually:

const api = new SsoApiClient(config.apiBaseUrl);

where DEV apiBaseUrl is:

https://shell-sso-service.app.dev1.use1.pcf.syfbank.com/api/auth

Preserve the existing SsoApiClient configuration:

withCredentials: true
xsrfCookieName: "XSRF-TOKEN"
xsrfHeaderName: "X-XSRF-TOKEN"

Do not hardcode environment-specific PCF URLs inside the reusable sso-auth-api-client package.

Do not create duplicate Axios clients.

Do not modify individual API methods with separate absolute URLs.

There must be one configurable base URL.

Before changing code, show the exact existing files to modify and explain the current config.js flow.

After implementation I will run:

npm run build
cf push -f manifest-dev-es1-dev1.yml

and verify in Chrome Network that /csrf and /bootstrap requests go to shell-sso-service rather than shell-sso-ui.
