# GitHub Copilot Implementation Guide — SSO Request Correlation & Splunk-Friendly Logging

## Goal

Enhance the existing `sso-backend` so every SSO journey can be traced end-to-end in Splunk using one `requestId`, while each individual HTTP call has its own `trackingId`.

Splunk and Logback are already configured. **Do not change Splunk or Logback configuration.** Focus only on code changes for correlation, MDC, stable event codes, flow lifecycle logging, external-service logging, safe user correlation, centralized error logging, session/context reuse logging, and tests.

## 1. Correlation model

Use these identifiers consistently:

- `requestId` = one complete SSO authorization journey. It is already generated in the existing SSO `start(...)` method. Reuse the same `requestId` for bootstrap, authenticate, flow/select, forgot password, forgot username, password expired, missing profile, Transmit, and final completion.
- `trackingId` = one individual HTTP request. Reuse incoming `X-Tracking-Id` if present; otherwise generate a UUID. Return it in response header `X-Tracking-Id`.
- `realm` = BCA / CCA / RCA / IHH / TTM etc.
- `clientId` = relying-party client ID.
- `flow` = existing backend `Flow` enum value.

Do **not** use the HTTP session ID as the Splunk business correlation key.

## 2. Create/extend logging package

Use:

```text
src/main/java/com/company/sso/logging/
```

Target classes:

```text
RequestTrackingFilter.java
SsoLogContext.java
SsoEventCode.java
SsoEventLogger.java
UserKeyGenerator.java
LogSanitizer.java
```

Before creating anything, search the codebase for existing MDC/tracking/sanitizer utilities. Reuse or extend them instead of creating duplicate infrastructure.

## 3. Stable event codes

Create `SsoEventCode.java`:

```java
package com.company.sso.logging;

public enum SsoEventCode {
    SSO_REQUEST_STARTED,
    SSO_REQUEST_CREATED,
    SSO_REQUEST_COMPLETED,
    SSO_REQUEST_FAILED,

    BOOTSTRAP_STARTED,
    BOOTSTRAP_RESOLVED,

    FLOW_STARTED,
    FLOW_COMPLETED,
    FLOW_FAILED,

    EXTERNAL_CALL_STARTED,
    EXTERNAL_CALL_COMPLETED,
    EXTERNAL_CALL_FAILED,

    SESSION_CREATED,
    SESSION_REUSED,
    REALM_CONTEXT_REUSED,
    CROSS_REALM_CONTEXT_REUSED,
    REMEMBER_ME_RESTORED,
    REQUEST_CONTEXT_BOUND,

    SECURITY_EVENT,
    SYSTEM_ERROR
}
```

Do not let developers invent multiple text variants such as `Login success`, `Successful login`, `Authentication passed`. Dashboards should rely on stable event codes.

## 4. RequestTrackingFilter

Implement or extend a `OncePerRequestFilter`.

Requirements:

- Read `X-Tracking-Id`.
- If missing/blank, create UUID.
- Put into MDC as `trackingId`.
- Put HTTP method in MDC as `httpMethod`.
- Put request URI in MDC as `requestPath`.
- Set response header `X-Tracking-Id`.
- Clear only keys owned by the filter in `finally`.
- Never put cookies, authorization headers, credentials, CSRF tokens, or request bodies into MDC.

Suggested implementation:

```java
@Component
public class RequestTrackingFilter extends OncePerRequestFilter {

    public static final String TRACKING_ID = "trackingId";
    public static final String TRACKING_HEADER = "X-Tracking-Id";

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain)
            throws ServletException, IOException {

        String trackingId = request.getHeader(TRACKING_HEADER);

        if (trackingId == null || trackingId.isBlank()) {
            trackingId = UUID.randomUUID().toString();
        }

        try {
            MDC.put(TRACKING_ID, trackingId);
            MDC.put("httpMethod", request.getMethod());
            MDC.put("requestPath", request.getRequestURI());

            response.setHeader(TRACKING_HEADER, trackingId);
            filterChain.doFilter(request, response);
        } finally {
            MDC.remove(TRACKING_ID);
            MDC.remove("httpMethod");
            MDC.remove("requestPath");
        }
    }
}
```

## 5. SsoLogContext

Create a utility for business correlation MDC fields:

```java
public final class SsoLogContext {

    private SsoLogContext() {}

    public static void setRequest(
            String requestId,
            String realm,
            String clientId) {
        put("requestId", requestId);
        put("realm", realm);
        put("clientId", clientId);
    }

    public static void setFlow(String flow) {
        put("flow", flow);
    }

    public static void setUserKey(String userKey) {
        put("userKey", userKey);
    }

    public static void setExternalService(String service) {
        put("externalService", service);
    }

    private static void put(String key, String value) {
        if (value != null && !value.isBlank()) {
            MDC.put(key, value);
        }
    }

    public static void clearBusinessContext() {
        MDC.remove("requestId");
        MDC.remove("realm");
        MDC.remove("clientId");
        MDC.remove("flow");
        MDC.remove("userKey");
        MDC.remove("externalService");
    }
}
```

Do not clear `trackingId` here; the filter owns it.

## 6. Privacy-safe userKey

Do not send raw username/email to Splunk unless company policy explicitly allows it.

Create a stable one-way `userKey` using SHA-256:

```java
@Component
public class UserKeyGenerator {

    public String generate(String username) {
        if (username == null || username.isBlank()) {
            return null;
        }

        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(
                    username.trim()
                            .toLowerCase()
                            .getBytes(StandardCharsets.UTF_8)
            );

            return "USR-" +
                    HexFormat.of()
                            .formatHex(hash)
                            .substring(0, 16);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to generate user key", ex);
        }
    }
}
```

Never log:

```text
password
newPassword
confirmPassword
OTP
security answer
access token
refresh token
authorization code
remember-me token
CSRF token
SSOSESSION cookie/session id
full sensitive request/response payloads
```

## 7. LogSanitizer

Create or extend an existing sanitizer to redact keys/names matching at least:

```text
password
newPassword
confirmPassword
otp
token
accessToken
refreshToken
authorization
cookie
sessionId
csrf
secret
securityAnswer
```

Preferred replacement:

```text
[REDACTED]
```

Do not log full authentication payloads and rely on sanitization as a primary protection. Prefer not logging them at all.

## 8. SsoEventLogger

Create a reusable business event logger. Common correlation fields should come from MDC.

Required event methods:

```java
requestStarted()
requestCreated()
requestCompleted(long durationMs)
requestFailed(String errorCode, long durationMs)
bootstrapStarted()
bootstrapResolved(Flow flow)
flowStarted(Flow flow)
flowCompleted(Flow flow, long durationMs)
flowFailed(Flow flow, String errorCode, long durationMs)
externalCallStarted(String service, String operation)
externalCallCompleted(String service, String operation, long durationMs)
externalCallFailed(String service, String operation, String errorCode, long durationMs)
sessionCreated()
sessionReused()
realmContextReused(String sourceRealm)
crossRealmContextReused(String sourceRealm, String targetRealm)
rememberMeRestored()
systemError(String errorCode, Throwable throwable)
```

Example style:

```java
@Component
public class SsoEventLogger {

    private static final Logger log =
            LoggerFactory.getLogger(SsoEventLogger.class);

    public void requestCreated() {
        log.info(
                "eventCode={} result=SUCCESS",
                SsoEventCode.SSO_REQUEST_CREATED
        );
    }

    public void bootstrapResolved(Flow flow) {
        log.info(
                "eventCode={} result=SUCCESS nextAction={}",
                SsoEventCode.BOOTSTRAP_RESOLVED,
                flow
        );
    }

    public void flowStarted(Flow flow) {
        log.info(
                "eventCode={} flow={} result=STARTED",
                SsoEventCode.FLOW_STARTED,
                flow
        );
    }

    public void flowCompleted(Flow flow, long durationMs) {
        log.info(
                "eventCode={} flow={} result=SUCCESS durationMs={}",
                SsoEventCode.FLOW_COMPLETED,
                flow,
                durationMs
        );
    }

    public void flowFailed(
            Flow flow,
            String errorCode,
            long durationMs) {
        log.warn(
                "eventCode={} flow={} result=FAILED errorCode={} durationMs={}",
                SsoEventCode.FLOW_FAILED,
                flow,
                errorCode,
                durationMs
        );
    }
}
```

Use existing safe error codes from the project instead of inventing duplicate codes.

## 9. Modify existing SSO start(...)

Current logic already roughly does:

```java
realm = policy.normalize(realm);
policy.validateClient(realm, client, redirect);
HttpSession s = req.getSession(true);
repo.cleanupExpired(s);
String id = UUID.randomUUID().toString();
Instant now = Instant.now();
SsoRequest r = new SsoRequest(...);
repo.saveRequest(s, r);
return r;
```

Keep functional behavior unchanged.

Add:

1. Detect whether session existed before `getSession(true)`.
2. Log `SESSION_CREATED` or `SESSION_REUSED`.
3. Continue generating a new `requestId` on every `/ssoAuthenticate` call.
4. Put `requestId`, `realm`, and `clientId` into MDC.
5. Log `SSO_REQUEST_CREATED`.
6. Never log session ID.

Suggested pattern:

```java
HttpSession existing = req.getSession(false);
boolean hadSession = existing != null;

HttpSession s = req.getSession(true);

String id = UUID.randomUUID().toString();

SsoLogContext.setRequest(id, realm, client);

if (hadSession) {
    eventLogger.sessionReused();
} else {
    eventLogger.sessionCreated();
}

// existing request creation logic
repo.saveRequest(s, r);
eventLogger.requestCreated();
```

Do not invalidate an existing session because a new SSO request arrives.

## 10. Modify existing bootstrap(...)

The existing `AuthenticationService.bootstrap(...)` already performs this sequence:

```text
getSession(false)
cleanupExpired
activeJourney(requestId)
requestUser(requestId)
validRealmUser(session, realm)
reuseFromAllowedRealm(session, request)
remember.restore(...)
AUTHENTICATE if no context
bindRequestUser(...)
nextFor(user)
```

Keep that logic unchanged.

At beginning:

```java
SsoLogContext.setRequest(
        r.requestId(),
        r.realm(),
        r.clientId()
);

eventLogger.bootstrapStarted();
```

For every return path, log the resolved next action.

Example:

```java
Flow next = activeJourney.get().nextAction();
SsoLogContext.setFlow(next.name());
eventLogger.bootstrapResolved(next);
return next;
```

Same-realm reuse:

```java
eventLogger.realmContextReused(r.realm());
```

Cross-realm reuse:

```java
eventLogger.crossRealmContextReused(
        sourceRealm,
        r.realm()
);
```

Remember-me restore:

```java
eventLogger.rememberMeRestored();
```

Before returning authenticate:

```java
SsoLogContext.setFlow(Flow.AUTHENTICATE.name());
eventLogger.bootstrapResolved(Flow.AUTHENTICATE);
return Flow.AUTHENTICATE;
```

Do not log entire `ExternalUser`, `RequestUserContext`, or `RealmUserContext` objects.

## 11. Modify authenticate(...)

Current method accepts approximately:

```java
public Flow authenticate(
        HttpServletRequest req,
        HttpServletResponse response,
        String requestId,
        String username,
        String password,
        boolean rememberRequested)
```

Requirements:

- Resolve stored `SsoRequest` from `requestId` first.
- Set MDC request context using stored realm/client, not values resent by React.
- Set `flow=AUTHENTICATE`.
- Set privacy-safe `userKey`.
- Log `FLOW_STARTED`.
- Measure duration with `System.nanoTime()`.
- Log `FLOW_COMPLETED` on success.
- Log `FLOW_FAILED` with existing safe error code on known failure.
- Never log password.
- Preserve existing exception behavior.

Example pattern:

```java
long started = System.nanoTime();

SsoLogContext.setRequest(
        requestId,
        ssoRequest.realm(),
        ssoRequest.clientId()
);
SsoLogContext.setFlow(Flow.AUTHENTICATE.name());
SsoLogContext.setUserKey(
        userKeyGenerator.generate(username)
);

eventLogger.flowStarted(Flow.AUTHENTICATE);

try {
    // existing authentication logic

    long durationMs =
            TimeUnit.NANOSECONDS.toMillis(
                    System.nanoTime() - started
            );

    eventLogger.flowCompleted(
            Flow.AUTHENTICATE,
            durationMs
    );

    return next;

} catch (InvalidCredentialsException ex) {

    long durationMs =
            TimeUnit.NANOSECONDS.toMillis(
                    System.nanoTime() - started
            );

    eventLogger.flowFailed(
            Flow.AUTHENTICATE,
            "INVALID_CREDENTIALS",
            durationMs
    );

    throw ex;
}
```

Use the project's real exception class and error code names.

## 12. FlowNavigationController

Existing endpoint:

```java
@PostMapping("/select")
public ActionResponse select(
        @RequestParam String requestId,
        @RequestParam Flow flow,
        HttpServletRequest request) {

    sso.beginJourney(
            request.getSession(false),
            requestId,
            flow
    );

    return ActionResponse.next(
            requestId,
            flow.name()
    );
}
```

Do not count a UI click twice.

Define dashboard semantics as:

```text
FLOW_STARTED = backend accepted and started a business flow
```

Prefer logging `FLOW_STARTED` in the service where `beginJourney(...)` or the actual recovery/business flow is accepted, not merely when React renders a component.

## 13. Forgot Password

Instrument backend methods/endpoints for:

```text
/forgot-password/start
/forgot-password/verify
/forgot-password/complete
```

Use the same `requestId` and set:

```text
flow=FORGOT_PASSWORD
```

Log lifecycle:

```text
FLOW_STARTED
FLOW_COMPLETED
FLOW_FAILED
```

Do not log email, phone number, OTP, password, token, or recovery secret.

If useful, log only approved non-sensitive dimension:

```text
deliveryChannel=EMAIL
deliveryChannel=SMS
```

## 14. Forgot Username

Use:

```text
flow=FORGOT_USERNAME
```

Log:

```text
FLOW_STARTED
FLOW_COMPLETED
FLOW_FAILED
```

Do not log full email, phone, DOB, account number, SSN, or recovery answers.

Preserve account-enumeration protections. Do not change user-facing behavior just for logging.

## 15. Password Expired

Use:

```text
flow=PASSWORD_EXPIRED
```

Log lifecycle only.

Never log old/new/confirm password or actual password input.

## 16. Missing Profile

Use:

```text
flow=MISSING_PROFILE
```

Log lifecycle only.

Do not log profile PII values. If analytics require missing field categories, log only approved field names/types such as `EMAIL` or `PHONE`, never the value.

## 17. Transmit

Use:

```text
flow=TRANSMIT
```

Log:

```text
FLOW_STARTED
FLOW_COMPLETED
FLOW_FAILED
```

Also instrument external Transmit SDK/service calls using:

```text
EXTERNAL_CALL_STARTED
EXTERNAL_CALL_COMPLETED
EXTERNAL_CALL_FAILED
```

Fields:

```text
externalService=transmit
operation=<stable safe operation>
durationMs
errorCode
```

Never log Transmit tokens, session secrets, challenge secrets, or credential material.

## 18. RemoteExternalLoginClient

Instrument each network call to the external login service.

Examples:

```text
externalService=login-service
operation=authenticate
operation=forgotPasswordStart
operation=forgotPasswordVerify
operation=forgotPasswordComplete
operation=forgotUsernameStart
operation=forgotUsernameVerify
```

Pattern:

```java
long started = System.nanoTime();

eventLogger.externalCallStarted(
        "login-service",
        "authenticate"
);

try {
    ExternalUser result = ...existing call...;

    long durationMs =
            TimeUnit.NANOSECONDS.toMillis(
                    System.nanoTime() - started
            );

    eventLogger.externalCallCompleted(
            "login-service",
            "authenticate",
            durationMs
    );

    return result;

} catch (KnownExternalException ex) {

    long durationMs =
            TimeUnit.NANOSECONDS.toMillis(
                    System.nanoTime() - started
            );

    eventLogger.externalCallFailed(
            "login-service",
            "authenticate",
            existingSafeErrorCode,
            durationMs
    );

    throw ex;
}
```

Do not log raw external request/response bodies.

## 19. GlobalExceptionHandler

Update existing handler carefully to avoid duplicate logs.

Recommended ownership:

- Flow/service layer logs expected lifecycle failures when it owns the flow.
- Global exception handler logs unexpected/system errors once.

Unexpected errors:

```java
eventLogger.systemError(
        "INTERNAL_ERROR",
        ex
);
```

Stack trace should be present for unexpected exceptions.

When MDC is available, Splunk should also contain:

```text
requestId
trackingId
realm
clientId
flow
```

## 20. Final SSO completion/failure

Find the code that creates the final authorization result / redirect to the relying party.

Log exactly one terminal journey event.

Success:

```text
eventCode=SSO_REQUEST_COMPLETED
result=SUCCESS
```

Failure:

```text
eventCode=SSO_REQUEST_FAILED
result=FAILED
errorCode=<safe code>
```

Calculate end-to-end duration from the existing `SsoRequest` creation timestamp:

```java
long durationMs = Duration.between(
        request.createdAt(),
        Instant.now()
).toMillis();
```

This must be exactly one terminal event per SSO request so Splunk request counts remain accurate.

## 21. Session/context reuse events

At SSO entry:

```text
SESSION_CREATED
SESSION_REUSED
```

In bootstrap:

```text
REALM_CONTEXT_REUSED
CROSS_REALM_CONTEXT_REUSED
REMEMBER_ME_RESTORED
```

This should allow dashboard questions such as:

```text
How many SSO requests reused an existing browser session?
How many users skipped credentials because same-realm context existed?
How many used cross-realm reuse?
How many were restored by Remember Me?
```

## 22. Standard field names

Use these exact names consistently when known:

```text
trackingId
requestId
realm
clientId
flow
userKey
externalService
httpMethod
requestPath
```

Stable event fields:

```text
eventCode
result
errorCode
durationMs
operation
nextAction
sourceRealm
targetRealm
```

Do not use variants like `reqId`, `requestID`, `request-id`, `authRequestId` for the same concept.

## 23. Dashboard event semantics

Use these definitions exactly:

- Incoming SSO requests: `eventCode=SSO_REQUEST_CREATED`
- Started business flows: `eventCode=FLOW_STARTED`
- Successful flows: `eventCode=FLOW_COMPLETED`
- Failed flows: `eventCode=FLOW_FAILED`
- Successful complete SSO journeys: `eventCode=SSO_REQUEST_COMPLETED`
- Failed complete SSO journeys: `eventCode=SSO_REQUEST_FAILED`
- Dependency success/failure: `EXTERNAL_CALL_COMPLETED` / `EXTERNAL_CALL_FAILED`

Do not count arbitrary log lines for dashboard totals.

## 24. Expected single-request journey

A search for one `requestId` should produce a chronological sequence similar to:

```text
SSO_REQUEST_CREATED
BOOTSTRAP_STARTED
BOOTSTRAP_RESOLVED flow=AUTHENTICATE
FLOW_STARTED flow=AUTHENTICATE
EXTERNAL_CALL_STARTED externalService=login-service operation=authenticate
EXTERNAL_CALL_FAILED errorCode=INVALID_CREDENTIALS
FLOW_FAILED flow=AUTHENTICATE errorCode=INVALID_CREDENTIALS
FLOW_STARTED flow=FORGOT_PASSWORD
EXTERNAL_CALL_STARTED operation=forgotPasswordStart
EXTERNAL_CALL_COMPLETED operation=forgotPasswordStart
FLOW_COMPLETED flow=FORGOT_PASSWORD
FLOW_STARTED flow=TRANSMIT
FLOW_COMPLETED flow=TRANSMIT
SSO_REQUEST_COMPLETED result=SUCCESS durationMs=8421
```

All lines above must share the same `requestId`.

Each separate HTTP call should have its own `trackingId`.

## 25. Splunk searches the code must support

One complete journey:

```spl
index=sso_prod requestId="<request-id>"
| sort _time
| table _time trackingId eventCode realm clientId flow result errorCode durationMs operation message
```

BCA request count:

```spl
index=sso_prod eventCode="SSO_REQUEST_CREATED" realm="BCA"
| stats count as totalRequests
```

Requests by realm:

```spl
index=sso_prod eventCode="SSO_REQUEST_CREATED"
| stats count as totalRequests by realm
```

Flow distribution:

```spl
index=sso_prod eventCode="FLOW_STARTED"
| chart count over realm by flow
```

Forgot Password:

```spl
index=sso_prod eventCode="FLOW_STARTED" flow="FORGOT_PASSWORD"
| stats count by realm
```

Forgot Username:

```spl
index=sso_prod eventCode="FLOW_STARTED" flow="FORGOT_USERNAME"
| stats count by realm
```

Transmit success/failure:

```spl
index=sso_prod flow="TRANSMIT"
eventCode IN ("FLOW_COMPLETED","FLOW_FAILED")
| chart count over realm by eventCode
```

Top errors:

```spl
index=sso_prod
eventCode IN ("FLOW_FAILED","SSO_REQUEST_FAILED","EXTERNAL_CALL_FAILED")
| stats count as failures by realm errorCode
| sort - failures
```

Unique users, only using privacy-safe `userKey`:

```spl
index=sso_prod eventCode="FLOW_COMPLETED" flow="AUTHENTICATE"
| stats dc(userKey) as uniqueUsers by realm
```

End-to-end SSO performance:

```spl
index=sso_prod eventCode="SSO_REQUEST_COMPLETED"
| stats avg(durationMs) as avgMs perc95(durationMs) as p95Ms perc99(durationMs) as p99Ms by realm
```

## 26. Tests to add

### RequestTrackingFilterTest

Verify:

- generates tracking ID when missing
- reuses incoming `X-Tracking-Id`
- writes response header
- clears MDC after request

### UserKeyGeneratorTest

Verify:

- same normalized username produces same key
- case differences produce same key
- null/blank returns null
- raw username is not present in generated key

### AuthenticationService tests

Verify logging changes do not alter behavior:

- new `/ssoAuthenticate` creates new requestId
- existing valid HttpSession is reused
- bootstrap with same-realm context skips `AUTHENTICATE`
- active journey resumes
- cross-realm reuse still works
- Remember Me behavior remains unchanged

### Flow behavior tests

Cover:

```text
AUTHENTICATE
FORGOT_PASSWORD
FORGOT_USERNAME
PASSWORD_EXPIRED
MISSING_PROFILE
TRANSMIT
```

### Security logging tests

Where practical, use a test appender and verify logs do not contain:

```text
password values
raw CSRF token
SSOSESSION value
remember-me token
access token
refresh token
OTP
security answers
```

## 27. Do not change existing behavior

Logging work must not change:

- session creation/reuse semantics
- requestId generation semantics
- GemFire-backed session behavior
- realm timeout rules
- same-realm reuse
- cross-realm reuse
- Remember Me behavior
- external login-service contract
- controller API contracts
- React API contracts
- CSRF behavior
- CORS behavior
- authorization behavior
- redirect validation
- client/realm policy validation

## 28. Copilot implementation order

1. Inspect existing MDC, logging, tracking, and sanitizer code.
2. Reuse existing equivalents where available.
3. Add/extend `RequestTrackingFilter`.
4. Add `SsoLogContext`.
5. Add `SsoEventCode`.
6. Add `SsoEventLogger`.
7. Add privacy-safe `UserKeyGenerator`.
8. Add/extend `LogSanitizer`.
9. Instrument `AuthenticationService.start(...)`.
10. Instrument `AuthenticationService.bootstrap(...)`.
11. Instrument `AuthenticationService.authenticate(...)`.
12. Instrument business flow start/navigation appropriately.
13. Instrument Forgot Password.
14. Instrument Forgot Username.
15. Instrument Password Expired.
16. Instrument Missing Profile.
17. Instrument Transmit.
18. Instrument `RemoteExternalLoginClient`.
19. Update `GlobalExceptionHandler` without duplicate error logs.
20. Add final SSO completion/failure logging.
21. Add tests.
22. Run all existing tests and ensure no functional behavior changes.

## 29. Copilot constraints

- Follow existing package naming and style.
- Use constructor injection.
- Do not use `System.out.println`.
- Use existing SLF4J/Logback only.
- Avoid duplicate logs.
- Never log credentials/tokens/session IDs.
- Preserve existing exception mapping.
- Preserve API response models.
- Preserve the existing `Flow` enum unless absolutely necessary.
- Prefer existing error codes.
- Use `System.nanoTime()` for elapsed duration and emit milliseconds.
- Never generate another business `requestId` after SSO entry.
- Never trust realm/client resent by React; resolve them from stored `SsoRequest` by `requestId`.
- Keep dashboard event semantics stable.
- Add comments only where correlation/security intent is not obvious.

## 30. Definition of done

Implementation is complete when:

1. Searching one `requestId` in Splunk shows the complete SSO journey in order.
2. Every HTTP call has a `trackingId`.
3. Every SSO journey has one stable `requestId`.
4. Realm/client are available once resolved.
5. Authentication success/failure is measurable.
6. Forgot Password usage is measurable.
7. Forgot Username usage is measurable.
8. Password Expired usage is measurable.
9. Missing Profile usage is measurable.
10. Transmit usage/success/failure is measurable.
11. External login-service success/failure/latency is measurable.
12. Session reuse and realm-context reuse are measurable.
13. End-to-end SSO latency is measurable.
14. Unexpected errors include stack traces and correlation identifiers.
15. No password/token/session-cookie/OTP/security-answer data appears in logs.
16. Existing authentication/session/flow behavior remains unchanged.

## Copilot prompt to use with this file

Use this prompt after adding this Markdown file to the repository:

```text
Read SSO_Splunk_Logging_Code_Change_Guide.md completely.
Inspect the existing sso-backend implementation before changing code.
Implement the guide incrementally using existing domain classes, existing error codes, existing logging infrastructure, and existing tests where possible.
Do not change functional SSO behavior, API contracts, session semantics, CSRF/CORS/security configuration, or external login-service contracts.
Do not log credentials, tokens, cookies, OTPs, session IDs, or raw PII.
First show me the exact files you plan to create or modify and why. Then implement the changes file by file.
```
