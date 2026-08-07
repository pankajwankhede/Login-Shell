package com.company.sso.api;

import com.company.sso.config.AuthProperties;
import com.company.sso.domain.AuthJourneyContext;
import com.company.sso.domain.SsoAuthorizationRequest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth/flow")
public class FlowNavigationController {

    private final AuthProperties authProperties;

    public FlowNavigationController(
            AuthProperties authProperties) {
        this.authProperties = authProperties;
    }

    @PostMapping("/select")
    public ApiModels.ActionResponse select(
            @RequestBody SelectFlowRequest body,
            HttpServletRequest servletRequest) {

        HttpSession session =
                servletRequest.getSession(false);

        if (session == null) {
            throw new ApiException(
                    HttpStatus.UNAUTHORIZED,
                    "SESSION_NOT_FOUND",
                    "Session is not available."
            );
        }

        @SuppressWarnings("unchecked")
        var requests =
                (java.util.Map<String, SsoAuthorizationRequest>)
                        session.getAttribute(
                                "AUTHORIZATION_REQUESTS"
                        );

        if (requests == null) {
            throw new ApiException(
                    HttpStatus.UNAUTHORIZED,
                    "REQUEST_NOT_FOUND",
                    "No active SSO requests were found."
            );
        }

        SsoAuthorizationRequest request =
                requests.get(body.requestId());

        if (request == null) {
            throw new ApiException(
                    HttpStatus.NOT_FOUND,
                    "REQUEST_NOT_FOUND",
                    "The SSO request was not found."
            );
        }

        String realm = request.realm();

        var realmConfig =
                authProperties.realms().get(realm);

        if (realmConfig == null) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "UNKNOWN_REALM",
                    "The realm is not configured."
            );
        }

        String requestedFlow =
                body.flow().toUpperCase();

        boolean enabled = switch (requestedFlow) {
            case "FORGOT_PASSWORD" ->
                    realmConfig.flows().forgotPassword();

            case "FORGOT_USERNAME" ->
                    realmConfig.flows().forgotUsername();

            case "AUTHENTICATE" ->
                    realmConfig.flows().authenticate();

            default -> false;
        };

        if (!enabled) {
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "FLOW_NOT_ALLOWED",
                    "The requested flow is not enabled for this realm."
            );
        }

        AuthJourneyContext journey =
                new AuthJourneyContext(
                        body.requestId(),
                        realm,
                        request.clientId(),
                        requestedFlow
                );

        @SuppressWarnings("unchecked")
        java.util.Map<String, AuthJourneyContext> journeys =
                (java.util.Map<String, AuthJourneyContext>)
                        session.getAttribute("AUTH_JOURNEYS");

        if (journeys == null) {
            journeys = new java.util.HashMap<>();
        } else {
            journeys = new java.util.HashMap<>(journeys);
        }

        journeys.put(body.requestId(), journey);

        session.setAttribute(
                "AUTH_JOURNEYS",
                journeys
        );

        return new ApiModels.ActionResponse(
                body.requestId(),
                requestedFlow,
                java.util.Map.of()
        );
    }

    public record SelectFlowRequest(
            String requestId,
            String flow
    ) {
    }
}
