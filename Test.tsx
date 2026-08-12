Do NOT create a new Axios client in the SSO Shell App.

The project already contains a dedicated package/module:
sso-auth-api-client

It already owns the AxiosInstance and all SSO backend communication.

Use and modify this existing module.

First inspect:

sso-auth-api-client/src/index.ts
sso-auth-api-client/src/normalizeApiError.tsx
its AuthApi interface/types
all request/response DTOs
package consumers in the shell app

Existing Axios setup already has:
withCredentials: true
xsrfCookieName: XSRF-TOKEN
xsrfHeaderName: X-XSRF-TOKEN

Preserve those.

Do not create:
src/services/api/ssoClient.ts
src/services/api/bootstrapApi.ts

in the shell app unless there is a proven missing requirement.

Required changes should primarily be made in sso-auth-api-client:

- bootstrap(requestId)
- authenticate
- forgot password APIs
- forgot username APIs
- password-expired update
- profile update
- transmit APIs
- requestId propagation
- normalizeApiError if required

The shell app should only:
- obtain requestId from route
- call SsoApiClient
- manage loading
- select/render flow module
- display shell-level service errors

Before changing code, show:
1. current AuthApi interface
2. current SsoApiClient implementation
3. current request DTOs
4. which methods already send requestId
5. which methods need requestId added
6. how the shell currently constructs SsoApiClient
7. whether baseURL is already injected/configured

Then make the smallest possible changes.
