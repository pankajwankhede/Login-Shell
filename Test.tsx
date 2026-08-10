# GitHub Copilot Task — Clean Up SSO MDC Correlation Ownership

## Objective

Refactor the existing SSO logging/MDC implementation so correlation fields are populated in one clear place, without duplicate writes, while preserving all existing authentication/session/flow behavior.

This task is specifically based on the current code in:

```text
SsoEntryController.java
AuthenticationService.java
RequestTrackingFilter.java
MdcContextService.java
```

Splunk and Logback are already configured. Do not change Splunk or Logback configuration.

---

# Current behavior observed

## `RequestTrackingFilter`

Current filter already:

- reads `X-Tracking-Id`
- falls back to a legacy transaction header
- generates UUID if missing
- stores tracking ID in MDC
- stores HTTP method/path in MDC
- returns tracking ID in response header
- clears filter/business MDC in `finally`

This behavior should remain.

## `SsoEntryController`

Current controller does approximately:

```java
mdc.applyJourneyContext(null, realm, clientId);

SsoRequest r = service.start(
        req,
        clientId,
        redirectUri,
        realm,
        state,
        scope,
        responseType
);

mdc.applyRequestContext(r);

log.info("SSO session request created");
```

## `AuthenticationService.start(...)`

Current service does approximately:

```java
HttpSession existingSession = req.getSession(false);

realm = policy.normalize(realm);

policy.validateClient(
        realm,
        client,
        redirect
);

HttpSession session = req.getSession(true);

if (existingSession == null) {
    eventLogger.sessionCreated();
} else {
    eventLogger.sessionReused();
}

repo.cleanupExpired(session);

String id = UUID.randomUUID().toString();

mdc.applyJourneyContext(
        id,
        realm,
        client
);

SsoLogContext.setRequest(
        id,
        realm,
        client,
        mdc
);

Instant now = Instant.now();

SsoRequest r = new SsoRequest(...);

repo.saveRequest(session, r);

eventLogger.requestCreated();

return r;
```

There is duplicate MDC population between:

```text
mdc.applyJourneyContext(...)
SsoLogContext.setRequest(...)
mdc.applyRequestContext(r)
```

The goal is to simplify this.

---

# Required design

Use this ownership model:

```text
RequestTrackingFilter
    owns:
        trackingId
        httpMethod
        requestPath

SsoEntryController
    may temporarily set:
        realm
        clientId
        requestId = null

AuthenticationService.start(...)
    owns setting the real:
        requestId
        realm
        clientId

Other service methods
    update:
        flow
        userKey
        externalService
```

---

# 1. Keep `RequestTrackingFilter` behavior

Do not change functional behavior unless needed for cleanup.

The filter should continue to:

```java
String trackingId = request.getHeader(TRACKING_HEADER);

if (trackingId == null || trackingId.isBlank()) {
    trackingId = request.getHeader(
            LEGACY_HEADER_TRANSACTION_ID
    );
}

if (trackingId == null || trackingId.isBlank()) {
    trackingId = UUID.randomUUID().toString();
}

mdc.putTrackId(trackingId);

mdc.setHttpRequest(
        request.getMethod(),
        request.getRequestURI()
);

response.setHeader(
        TRACKING_HEADER,
        trackingId
);

filterChain.doFilter(
        request,
        response
);
```

In `finally`, clear MDC:

```java
finally {
    mdc.clearFilterContext();
    mdc.clearBusinessContext();
}
```

This cleanup is required because servlet threads are reused.

Do not remove it.

---

# 2. Simplify `SsoEntryController`

Keep only the early context needed before `requestId` exists.

Recommended:

```java
@GetMapping("/login/ssoAuthenticate")
public ResponseEntity<Void> start(
        @RequestParam String clientId,
        @RequestParam String redirectUri,
        @RequestParam String realm,
        @RequestParam(required = false) String state,
        @RequestParam(required = false) String scope,
        @RequestParam(required = false, defaultValue = "code")
        String responseType,
        HttpServletRequest req) {

    /*
     * requestId does not exist yet.
     * Set realm/clientId so validation failures still carry context.
     */
    mdc.applyJourneyContext(
            null,
            realm,
            clientId
    );

    SsoRequest r = service.start(
            req,
            clientId,
            redirectUri,
            realm,
            state,
            scope,
            responseType
    );

    log.info("SSO session request created");

    return ResponseEntity
            .status(HttpStatus.FOUND)
            .location(
                    URI.create(
                            "http://localhost:5173/login/flow/"
                                    + r.requestId()
                    )
            )
            .build();
}
```

Remove this line from the controller if `AuthenticationService.start(...)` already populated the full request context:

```java
mdc.applyRequestContext(r);
```

Do not populate the same request context in both controller and service.

---

# 3. Simplify `AuthenticationService.start(...)`

After generating the actual `requestId`, update MDC once.

Recommended:

```java
public SsoRequest start(
        HttpServletRequest req,
        String client,
        String redirect,
        String realm,
        String state,
        String scope,
        String responseType) {

    HttpSession existingSession =
            req.getSession(false);

    realm = policy.normalize(realm);

    log.info(
            "Starting SSO request: realm={}, clientId={}",
            realm,
            client
    );

    policy.validateClient(
            realm,
            client,
            redirect
    );

    HttpSession session =
            req.getSession(true);

    if (existingSession == null) {
        eventLogger.sessionCreated();
    } else {
        eventLogger.sessionReused();
    }

    repo.cleanupExpired(session);

    String requestId =
            UUID.randomUUID().toString();

    /*
     * This is the single authoritative point where
     * the real SSO requestId is added to MDC.
     */
    mdc.applyJourneyContext(
            requestId,
            realm,
            client
    );

    Instant now = Instant.now();

    SsoRequest r =
            new SsoRequest(
                    requestId,
                    client,
                    realm,
                    redirect,
                    state,
                    scope,
                    responseType == null
                            ? "code"
                            : responseType,
                    now,
                    ...
            );

    repo.saveRequest(
            session,
            r
    );

    eventLogger.requestCreated();

    return r;
}
```

Remove the duplicate call if it writes the same MDC fields:

```java
SsoLogContext.setRequest(
        requestId,
        realm,
        client,
        mdc
);
```

There should be one API for setting request-level business MDC fields.

Preferred API:

```java
mdc.applyJourneyContext(
        requestId,
        realm,
        clientId
);
```

---

# 4. Decide whether `SsoLogContext` is still needed

Inspect:

```text
SsoLogContext.java
MdcContextService.java
```

If both are doing the same thing, remove one abstraction.

Preferred direction:

```text
MdcContextService
```

should own all MDC writes.

For example:

```java
mdc.applyJourneyContext(
        requestId,
        realm,
        clientId
);

mdc.setFlow(flow);

mdc.setUserKey(userKey);

mdc.setExternalService(service);
```

If `SsoLogContext` contains unique useful logic, keep it.

If it only forwards calls to `MdcContextService`, remove it.

Do not maintain two competing MDC APIs.

---

# 5. Required MDC ownership

Use these fields consistently:

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

Ownership:

```text
RequestTrackingFilter:
    trackingId
    httpMethod
    requestPath

SSO entry/service:
    requestId
    realm
    clientId

Flow services:
    flow

Authentication flow:
    userKey

External client/adapter:
    externalService
```

---

# 6. `trackingId` and `requestId` are different concepts

Do not intentionally set:

```text
trackingId = requestId
```

They represent different correlation levels.

## `trackingId`

One HTTP request.

Example:

```text
GET /bootstrap
trackingId=HTTP-001
```

## `requestId`

One complete SSO journey.

Example:

```text
requestId=SSO-ABC
```

Expected journey:

```text
/login/ssoAuthenticate
trackingId=HTTP-001
requestId=SSO-ABC

/api/auth/bootstrap/SSO-ABC
trackingId=HTTP-002
requestId=SSO-ABC

/api/auth/authenticate
trackingId=HTTP-003
requestId=SSO-ABC

/api/auth/flow/select
trackingId=HTTP-004
requestId=SSO-ABC
```

The requestId stays the same across the full journey.

The trackingId changes per HTTP request.

---

# 7. Check frontend behavior

Inspect the React API client.

If React currently sends:

```text
X-Tracking-Id = requestId
```

remove that behavior.

Preferred:

- frontend sends `requestId` only as the business request identifier
- backend filter generates `trackingId` per HTTP request if upstream did not provide one

Frontend should not intentionally make the two identifiers identical.

---

# 8. Early validation errors

The reason `SsoEntryController` may temporarily call:

```java
mdc.applyJourneyContext(
        null,
        realm,
        clientId
);
```

is to support failures before requestId generation.

Example:

```text
CLIENT_NOT_ALLOWED
REDIRECT_URI_NOT_ALLOWED
REALM_DISABLED
```

These logs should still contain:

```text
trackingId
realm
clientId
```

but may have:

```text
requestId=""
```

That is acceptable because the SSO request was rejected before requestId creation.

---

# 9. Normal successful entry flow

Expected logging progression:

```text
RequestTrackingFilter
    trackingId=HTTP-001

SsoEntryController
    trackingId=HTTP-001
    realm=BCA
    clientId=bca-web
    requestId=

AuthenticationService.start
    generates requestId=SSO-ABC

AuthenticationService.start
    trackingId=HTTP-001
    requestId=SSO-ABC
    realm=BCA
    clientId=bca-web

SSO_REQUEST_CREATED
    trackingId=HTTP-001
    requestId=SSO-ABC
```

After response completes, filter clears MDC.

---

# 10. Later API request flow

For:

```text
GET /api/auth/bootstrap/SSO-ABC
```

filter creates:

```text
trackingId=HTTP-002
```

The service/controller resolves stored `SsoRequest` using:

```text
requestId=SSO-ABC
```

Then MDC becomes:

```text
trackingId=HTTP-002
requestId=SSO-ABC
realm=BCA
clientId=bca-web
```

That is the desired Splunk correlation model.

---

# 11. Do not log session IDs

Keep session events:

```text
SESSION_CREATED
SESSION_REUSED
```

But never include:

```text
session.getId()
SSOSESSION cookie
```

in logs.

---

# 12. Preserve current business behavior

This cleanup must not change:

```text
session reuse
requestId generation
GemFire session handling
bootstrap behavior
same-realm reuse
cross-realm reuse
remember-me
CSRF
CORS
security
redirect validation
realm/client validation
React API contract
external login-service contract
```

Only logging/MDC ownership should change.

---

# 13. Tests to add/update

## MDC ownership test

Verify that after `AuthenticationService.start(...)`:

```text
requestId
realm
clientId
```

are populated once and correctly.

## Entry validation failure test

For an invalid client:

```text
trackingId is present
realm is present
clientId is present
requestId may be empty
```

## Tracking/request separation test

Verify:

```text
trackingId != requestId
```

unless an upstream system coincidentally supplied the same value.

Do not enforce inequality as a hard production validation rule; just ensure the application does not intentionally assign one from the other.

## Filter cleanup test

After request completion:

```text
trackingId cleared
httpMethod cleared
requestPath cleared
requestId cleared
realm cleared
clientId cleared
flow cleared
userKey cleared
externalService cleared
```

## Existing behavior regression tests

Ensure all existing authentication/session tests still pass.

---

# 14. Copilot implementation instructions

Use this exact implementation sequence:

1. Inspect `MdcContextService.java`.
2. Inspect `SsoLogContext.java`.
3. Identify duplicate MDC responsibilities.
4. Keep `RequestTrackingFilter` as owner of HTTP correlation fields.
5. Keep early realm/client context in `SsoEntryController`.
6. Remove `mdc.applyRequestContext(r)` from controller if redundant.
7. Make `AuthenticationService.start(...)` the single authoritative place where the real requestId is applied.
8. Remove `SsoLogContext.setRequest(...)` if redundant.
9. Check React API client for incorrect `X-Tracking-Id=requestId` behavior.
10. Update tests.
11. Run the full existing test suite.
12. Do not modify functional SSO behavior.

---

# 15. Definition of done

The task is complete when:

1. One SSO request creates one `requestId`.
2. One HTTP call has one `trackingId`.
3. `trackingId` and `requestId` are not intentionally derived from each other.
4. Early SSO validation logs have realm/client/tracking context.
5. Once requestId is generated, all downstream logs for that HTTP request contain it.
6. Subsequent HTTP calls resolve and repopulate the same SSO requestId.
7. MDC fields are populated through one clear service/API.
8. Duplicate MDC writes are removed.
9. MDC is fully cleared when the servlet request completes.
10. No session ID, credentials, tokens, OTPs, or sensitive payloads are logged.
11. Existing SSO behavior and tests remain unchanged.

---

# 16. Track `previousRequestId` for repeated `/ssoAuthenticate` calls

Add support for linking a newly created SSO request to the most recent previous SSO request in the same browser `HttpSession`.

This is for **observability only**.

Do not use `previousRequestId` for:

```text
authorization
flow selection
realm selection
redirect decisions
user-context lookup
security decisions
```

The real business/security key remains:

```text
requestId
```

## Desired behavior

If the same browser calls:

```text
/login/ssoAuthenticate
```

for the first time:

```text
trackingId=HTTP-001
requestId=REQ-1001
previousRequestId=
sessionReused=false
```

If the same browser later calls `/login/ssoAuthenticate` again while the same `HttpSession` is valid:

```text
trackingId=HTTP-010
requestId=REQ-2002
previousRequestId=REQ-1001
sessionReused=true
```

Always create a **new** `requestId`.

Never reuse the previous `requestId` for the new SSO authorization request.

---

# 17. Read previous request before generating the new request

Inside `AuthenticationService.start(...)`, before generating the new UUID, determine the most recent existing SSO request in the current session.

Preferred approach:

```java
HttpSession existingSession =
        req.getSession(false);

String previousRequestId = null;

if (existingSession != null) {
    previousRequestId =
            repo.latestRequest(existingSession)
                    .map(SsoRequest::requestId)
                    .orElse(null);
}
```

Then continue with the normal logic:

```java
HttpSession session =
        req.getSession(true);

String requestId =
        UUID.randomUUID().toString();
```

Do not overwrite the previous request.

The session may contain multiple requests:

```text
SSOSESSION
├── REQ-1001
├── REQ-1500
└── REQ-2002
```

`previousRequestId` is only a telemetry relationship between the new request and the most recent prior request.

---

# 18. Add repository helper for latest request if needed

If `SessionStateRepository` does not already support this, add a helper such as:

```java
public Optional<SsoRequest> latestRequest(
        HttpSession session) {

    return requests(session)
            .values()
            .stream()
            .max(
                    Comparator.comparing(
                            SsoRequest::createdAt
                    )
            );
}
```

Adapt this to the actual repository structure.

Do not introduce a separate authoritative:

```text
CURRENT_REQUEST_ID
```

or:

```text
LAST_REQUEST_ID
```

for business logic.

If a `LAST_REQUEST_ID` helper attribute is used for telemetry, it must never drive authentication, authorization, or flow decisions.

Using the timestamp from the existing request map is preferred.

---

# 19. Add `previousRequestId` to MDC

Extend `MdcContextService` with a method similar to:

```java
public void setPreviousRequestId(
        String previousRequestId) {

    if (previousRequestId == null
            || previousRequestId.isBlank()) {
        MDC.remove("previousRequestId");
        return;
    }

    MDC.put(
            "previousRequestId",
            previousRequestId
    );
}
```

After generating the new request ID:

```java
String requestId =
        UUID.randomUUID().toString();

mdc.applyJourneyContext(
        requestId,
        realm,
        client
);

mdc.setPreviousRequestId(
        previousRequestId
);
```

The MDC for that `/ssoAuthenticate` call should then contain:

```text
trackingId=HTTP-010
requestId=REQ-2002
previousRequestId=REQ-1001
realm=BCA
clientId=bca-web
```

---

# 20. Do NOT clear `previousRequestId` immediately

Do not do this:

```java
mdc.setPreviousRequestId(
        previousRequestId
);

String requestId =
        UUID.randomUUID().toString();

mdc.setPreviousRequestId(null);
```

That removes the relationship too early and later logs in the same HTTP request will no longer contain it.

Keep `previousRequestId` in MDC for the full lifetime of that HTTP request.

The servlet filter should clear it at the end.

---

# 21. Clear `previousRequestId` with business MDC

Update:

```java
MdcContextService.clearBusinessContext()
```

to include:

```java
MDC.remove("previousRequestId");
```

Example:

```java
public void clearBusinessContext() {

    MDC.remove("requestId");
    MDC.remove("previousRequestId");
    MDC.remove("realm");
    MDC.remove("clientId");
    MDC.remove("flow");
    MDC.remove("userKey");
    MDC.remove("externalService");
}
```

The existing filter cleanup should remain:

```java
finally {
    mdc.clearFilterContext();
    mdc.clearBusinessContext();
}
```

This prevents one servlet-thread request from leaking correlation values into the next request.

---

# 22. Add `previousRequestId` to `SSO_REQUEST_CREATED`

When the new request is saved:

```java
repo.saveRequest(
        session,
        r
);
```

emit an event that includes the relationship.

If `previousRequestId` is already in MDC, the event logger only needs to log:

```java
eventLogger.requestCreated(
        existingSession != null
);
```

or equivalent.

Expected structured fields:

```text
eventCode=SSO_REQUEST_CREATED
trackingId=HTTP-010
requestId=REQ-2002
previousRequestId=REQ-1001
realm=BCA
clientId=bca-web
sessionReused=true
result=SUCCESS
```

Do not log the actual session ID.

---

# 23. First request behavior

For the first request in a browser session:

```text
previousRequestId
```

will be absent.

Expected:

```text
eventCode=SSO_REQUEST_CREATED
trackingId=HTTP-001
requestId=REQ-1001
previousRequestId=
realm=BCA
clientId=bca-web
sessionReused=false
```

This is valid.

Do not create fake values such as:

```text
previousRequestId=NONE
previousRequestId=NEW
previousRequestId=NA
```

Prefer null/absent structured field.

---

# 24. Subsequent request behavior

For a second `/ssoAuthenticate` in the same browser session:

```text
eventCode=SSO_REQUEST_CREATED
trackingId=HTTP-010
requestId=REQ-2002
previousRequestId=REQ-1001
realm=BCA
clientId=bca-web
sessionReused=true
```

Then `bootstrap(...)` may produce:

```text
eventCode=REALM_CONTEXT_REUSED
requestId=REQ-2002
realm=BCA
```

This lets Splunk show:

```text
REQ-1001
    authenticated BCA user

REQ-2002
    linked to REQ-1001
    same browser session reused
    BCA realm context reused
    credentials not requested again
```

---

# 25. Do not store `previousTrackingId`

Do not add:

```text
previousTrackingId
```

to the session.

`trackingId` represents a single HTTP request and is already searchable in Splunk.

The desired model is:

```text
First SSO entry:
trackingId=HTTP-A
requestId=REQ-1

Second SSO entry:
trackingId=HTTP-B
requestId=REQ-2
previousRequestId=REQ-1
```

This is sufficient to trace the relationship.

---

# 26. Multi-tab safety

The browser session can have multiple independent SSO authorization requests.

Example:

```text
SSOSESSION
├── REQ-1001  BCA/client-A
├── REQ-1002  CCA/client-B
├── REQ-1003  BCA/client-C
└── REQ-1004  RCA/client-D
```

Do not treat `previousRequestId` as the active request.

Every API request must continue to identify its own `requestId`.

`previousRequestId` is only useful for Splunk troubleshooting.

Do not use:

```java
previousRequestId
```

to resolve:

```text
realm
clientId
journey
request user
authorization request
redirect URI
```

---

# 27. Splunk queries for repeated SSO requests

## Show a request and its previous request

```spl
index=sso_prod
requestId="REQ-2002"
| table
    _time
    trackingId
    requestId
    previousRequestId
    realm
    clientId
    eventCode
    flow
    result
    errorCode
```

## Show both journeys

After identifying:

```text
requestId=REQ-2002
previousRequestId=REQ-1001
```

search:

```spl
index=sso_prod
requestId IN ("REQ-1001","REQ-2002")
| sort _time
| table
    _time
    requestId
    trackingId
    eventCode
    realm
    clientId
    flow
    result
    errorCode
```

This should show whether the second request:

```text
reused the same browser session
reused same-realm context
used cross-realm context
went through remember-me
required authentication again
failed during bootstrap
failed during a downstream flow
```

---

# 28. Tests for `previousRequestId`

Add tests covering:

## First SSO request

Expected:

```text
new requestId generated
previousRequestId absent
sessionCreated event emitted
```

## Second request in same session

Expected:

```text
new requestId generated
new requestId != previous requestId
previousRequestId points to earlier request
sessionReused event emitted
```

## Three requests

Example:

```text
REQ-1
REQ-2 previousRequestId=REQ-1
REQ-3 previousRequestId=REQ-2
```

## MDC cleanup

After HTTP request completion:

```text
requestId cleared
previousRequestId cleared
realm cleared
clientId cleared
trackingId cleared by filter context cleanup
```

## Multi-tab safety

Verify that adding `previousRequestId` does not change lookup behavior for independently active `requestId` values.

---

# 29. Updated MDC field list

When known, structured logging should support:

```text
trackingId
requestId
previousRequestId
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
sessionReused
```

---

# 30. Updated definition of done

In addition to the previous definition of done:

1. Repeated `/ssoAuthenticate` calls create a new `requestId`.
2. The new request can expose the most recent prior request as `previousRequestId`.
3. `previousRequestId` is available to logs for the entire `/ssoAuthenticate` HTTP request.
4. It is cleared automatically at request completion.
5. It is not used for security/business decisions.
6. No previous tracking ID or session ID is persisted for correlation.
7. Splunk can easily show the old and new SSO journeys together.

---

# 31. Ready-to-paste GitHub Copilot prompt

Copy and paste the following prompt into GitHub Copilot Chat from the root of the `sso-backend` repository.

```text
Read the complete file:

SSO_MDC_Correlation_Cleanup_Copilot_Guide.md

before making any code changes.

I want you to implement the MDC, request correlation, previousRequestId, and Splunk observability changes described in that document against my CURRENT existing source code.

IMPORTANT: Do not blindly generate replacement classes from the examples in the markdown file. First inspect the actual existing implementation and adapt the changes to the existing architecture, class names, models, repositories, exception types, methods, and coding conventions.

First inspect these files/classes and any directly related dependencies:

1. RequestTrackingFilter
2. MdcContextService
3. SsoLogContext
4. SsoEventLogger
5. SsoEventCode
6. SsoEntryController
7. AuthenticationService
8. SessionStateRepository or the actual session repository implementation
9. SsoRequest model
10. BootstrapController
11. AuthenticationController
12. FlowNavigationController
13. RecoveryController
14. PostAuthenticationController
15. GlobalExceptionHandler
16. ExternalLoginClient / RemoteExternalLoginClient
17. Remember Me implementation
18. Transmit service/adapter
19. React SsoApiClient only if needed to verify trackingId behavior

Before coding, give me a short implementation plan containing:

- files that will be modified
- files that will be created, if any
- duplicate MDC logic you found
- how trackingId currently works
- how requestId currently works
- where previousRequestId will be obtained
- how previousRequestId will be cleared
- any risks you found

Then implement the changes incrementally.

CORRELATION RULES

1. trackingId represents ONE HTTP request.
2. requestId represents ONE complete SSO authorization journey.
3. previousRequestId represents the immediately previous SSO request found in the same valid browser HttpSession and is OBSERVABILITY ONLY.
4. Never intentionally set trackingId equal to requestId.
5. Never reuse an old requestId for a new /ssoAuthenticate call.
6. Every /ssoAuthenticate call must continue generating a new requestId.
7. Subsequent APIs for the same journey must continue using the same requestId.
8. previousRequestId must never be used for authentication, authorization, realm resolution, flow selection, redirect decisions, or session lookup.
9. Do not persist previousTrackingId.
10. Do not log the actual HttpSession ID or SSOSESSION cookie.

EXPECTED REPEATED REQUEST BEHAVIOR

First browser call:

trackingId=HTTP-001
requestId=REQ-1001
previousRequestId=<absent>
realm=BCA
clientId=bca-web
sessionReused=false

Second /ssoAuthenticate call in the same valid browser session:

trackingId=HTTP-010
requestId=REQ-2002
previousRequestId=REQ-1001
realm=BCA
clientId=bca-web
sessionReused=true

Third call:

trackingId=HTTP-020
requestId=REQ-3003
previousRequestId=REQ-2002
sessionReused=true

The SSO request map must continue supporting multiple concurrent requestIds for multi-tab safety.

MDC OWNERSHIP

RequestTrackingFilter owns:

- trackingId
- httpMethod
- requestPath

SSO entry/service owns:

- requestId
- previousRequestId
- realm
- clientId

Flow/business services own:

- flow
- userKey
- externalService

Do not maintain duplicate competing MDC APIs.

Inspect MdcContextService and SsoLogContext. If both perform the same operation, consolidate them using the least disruptive approach. Prefer the existing MdcContextService if it is already the established abstraction.

SSO ENTRY CONTROLLER

The controller may temporarily populate:

requestId=null
realm=<incoming realm>
clientId=<incoming client>

so CLIENT_NOT_ALLOWED, REALM_DISABLED, REDIRECT_URI_NOT_ALLOWED, and similar errors occurring before requestId creation still have trackingId/realm/clientId.

Once AuthenticationService.start() generates the real requestId, that service should become the authoritative place that updates the full journey MDC.

Remove redundant controller calls such as applyRequestContext(r) if start() already populated exactly the same MDC context.

AUTHENTICATIONSERVICE.START

Preserve all existing functional behavior.

Before creating a new request:

- detect whether an existing HttpSession exists
- determine the latest previously stored SsoRequest, if one exists
- capture its requestId as previousRequestId

Then:

- reuse/create HttpSession exactly as today
- normalize and validate realm/client/redirect exactly as today
- generate a NEW UUID requestId
- populate requestId/previousRequestId/realm/clientId into MDC
- create and save the new SsoRequest
- emit SESSION_CREATED or SESSION_REUSED
- emit SSO_REQUEST_CREATED

Do not overwrite/delete the previous SsoRequest merely to support telemetry.

Prefer determining the latest request from existing request creation timestamps.

If repository support is missing, add a safe helper such as latestRequest(HttpSession), adapting it to the actual storage implementation.

PREVIOUSREQUESTID LIFECYCLE

Keep previousRequestId in MDC for the remainder of the current /ssoAuthenticate HTTP request so every log produced after new request creation can contain:

trackingId
requestId
previousRequestId
realm
clientId

Do NOT immediately set previousRequestId to null after generating the new requestId.

At servlet-request completion, RequestTrackingFilter cleanup must clear it through clearBusinessContext().

Ensure:

MDC.remove("previousRequestId")

is included in business-context cleanup.

MULTI-TAB SAFETY

Do not introduce a global CURRENT_REQUEST_ID or use LAST_REQUEST_ID for authentication logic.

Example valid session:

REQ-1001 -> BCA/client-A
REQ-1002 -> CCA/client-B
REQ-1003 -> BCA/client-C

Each browser tab/API must continue supplying its own requestId.

previousRequestId is telemetry only.

SESSION / REALM REUSE

Preserve existing bootstrap behavior:

- active journey by requestId
- request-specific user context
- valid same-realm user context
- allowed cross-realm reuse
- Remember Me restoration
- AUTHENTICATE fallback
- request-user binding
- nextFor(user)

Add/retain appropriate stable observability events:

SESSION_CREATED
SESSION_REUSED
REALM_CONTEXT_REUSED
CROSS_REALM_CONTEXT_REUSED
REMEMBER_ME_RESTORED
BOOTSTRAP_STARTED
BOOTSTRAP_RESOLVED

FLOW LOGGING

Ensure stable lifecycle logging supports:

AUTHENTICATE
FORGOT_PASSWORD
FORGOT_USERNAME
PASSWORD_EXPIRED
MISSING_PROFILE
TRANSMIT

Use:

FLOW_STARTED
FLOW_COMPLETED
FLOW_FAILED

Do not count React page rendering as FLOW_STARTED. FLOW_STARTED should mean the backend accepted/started that business flow.

EXTERNAL CALL LOGGING

Instrument existing external login/identity and Transmit calls using:

EXTERNAL_CALL_STARTED
EXTERNAL_CALL_COMPLETED
EXTERNAL_CALL_FAILED

Include safe fields:

externalService
operation
durationMs
errorCode
requestId
trackingId
realm
clientId
flow

Do not log request/response bodies containing sensitive information.

ERROR LOGGING

Do not double-log expected exceptions.

Review GlobalExceptionHandler and service-level logging and establish one consistent ownership rule.

Unexpected exceptions should be logged once with:

SYSTEM_ERROR
errorCode=INTERNAL_ERROR
stack trace
trackingId
requestId when available
realm/clientId/flow when available

SECURITY / PRIVACY

Never log:

- password
- oldPassword
- newPassword
- confirmPassword
- OTP
- security answer
- access token
- refresh token
- authorization code
- Remember Me token
- CSRF token
- Cookie header
- Authorization header
- SSOSESSION value
- HttpSession ID
- raw sensitive external service payload
- full recovery email/phone/account/SSN data

Use the existing privacy-safe userKey approach where applicable.

TRACKING ID VALIDATION

Review RequestTrackingFilter.

Continue supporting existing X-Tracking-Id and legacy transaction-ID behavior.

If an incoming tracking ID is accepted, validate it with a conservative max length and safe character set before placing it in logs. Generate a UUID when missing/blank/invalid.

Do not break any upstream tracing requirement already present in the application.

FRONTEND CHECK

Inspect SsoApiClient only to verify whether React is intentionally sending:

X-Tracking-Id = requestId

If it is, remove that coupling unless existing enterprise infrastructure explicitly requires it.

The normal model should be:

frontend sends requestId as business journey identifier
backend/upstream generates trackingId for each HTTP request

TESTS

Add/update tests for at least:

1. first /ssoAuthenticate:
   - new session when absent
   - new requestId
   - previousRequestId absent

2. second /ssoAuthenticate in same session:
   - same HttpSession reused
   - new requestId
   - previousRequestId points to first request

3. third request:
   - REQ-3 previousRequestId points to REQ-2

4. multiple requestIds remain stored and independently usable

5. RequestTrackingFilter:
   - generates trackingId
   - accepts valid incoming trackingId
   - handles legacy header
   - rejects/normalizes unsafe tracking ID
   - writes response header
   - clears MDC

6. MdcContextService:
   - requestId
   - previousRequestId
   - realm
   - clientId
   - flow
   - userKey
   - externalService
   are properly cleared

7. same-realm session reuse continues working

8. cross-realm reuse continues working

9. Remember Me continues working

10. flow behavior remains unchanged

11. logs do not expose passwords/tokens/session values

12. existing tests remain green

DO NOT CHANGE

Do not change functional behavior for:

- GemFire/Spring Session
- session timeout
- realm timeout
- requestId generation
- authorization request storage
- active journey storage
- request-user binding
- cross-realm rules
- Remember Me
- external login contract
- Transmit contract
- CSRF
- CORS
- Spring Security authorization
- redirect URI validation
- realm/client validation
- controller request/response contract
- React flow contract

SPLUNK RESULT REQUIRED

After implementation, these searches must be supported by structured fields.

Single journey:

index=sso_prod requestId="<request-id>"
| sort _time

Repeated SSO calls:

index=sso_prod requestId IN ("REQ-1001","REQ-2002")
| sort _time
| table _time trackingId requestId previousRequestId eventCode realm clientId flow result errorCode durationMs

Flow dashboard:

index=sso_prod eventCode="FLOW_STARTED"
| chart count over realm by flow

Failures:

index=sso_prod eventCode IN ("FLOW_FAILED","SSO_REQUEST_FAILED","EXTERNAL_CALL_FAILED")
| stats count by realm errorCode

End-to-end latency:

index=sso_prod eventCode="SSO_REQUEST_COMPLETED"
| stats avg(durationMs) perc95(durationMs) perc99(durationMs) by realm

FINAL OUTPUT FROM COPILOT

After implementation:

1. Show all files changed.
2. Explain the purpose of each change.
3. Show the final MDC ownership model.
4. Show the final requestId/trackingId/previousRequestId lifecycle.
5. Show example logs for:
   - first SSO request
   - second SSO request in same session
   - same-realm reuse
   - failed authentication
   - Forgot Password
   - Transmit
6. List tests added/modified.
7. Run tests/build.
8. Report any failing tests or unresolved concerns.
9. Do not claim completion if the project does not compile or tests fail.
```
