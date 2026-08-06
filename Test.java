@Bean
SecurityFilterChain chain(HttpSecurity http) throws Exception {

    CookieCsrfTokenRepository csrfRepository =
            CookieCsrfTokenRepository.withHttpOnlyFalse();

    csrfRepository.setCookiePath("/");
    csrfRepository.setCookieName("XSRF-TOKEN");
    csrfRepository.setHeaderName("X-XSRF-TOKEN");

    CsrfTokenRequestAttributeHandler requestHandler =
            new CsrfTokenRequestAttributeHandler();

    requestHandler.setCsrfRequestAttributeName("_csrf");

    return http
            .cors(Customizer.withDefaults())

            .csrf(csrf -> csrf
                    .csrfTokenRepository(csrfRepository)
                    .csrfTokenRequestHandler(requestHandler)
            )

            .authorizeHttpRequests(auth -> auth
                    .requestMatchers(
                            "/actuator/health",
                            "/login/**",
                            "/api/auth/csrf",
                            "/api/auth/bootstrap/**",
                            "/api/auth/flow/**",
                            "/api/auth/recovery/**",
                            "/api/auth/authenticate"
                    )
                    .permitAll()

                    .anyRequest()
                    .permitAll()
            )

            .headers(headers -> headers
                    .contentSecurityPolicy(csp -> csp
                            .policyDirectives(
                                    "default-src 'self'; " +
                                    "img-src 'self' data: https:; " +
                                    "script-src 'self'; " +
                                    "style-src 'self' 'unsafe-inline'; " +
                                    "connect-src 'self'; " +
                                    "frame-ancestors 'none'; " +
                                    "base-uri 'self'; " +
                                    "form-action 'self'"
                            )
                    )
            )

            .build();
}

==================================

  CsrfController.java

  package com.company.sso.api;

import java.util.Map;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class CsrfController {

    @GetMapping("/csrf")
    public Map<String, String> csrf(CsrfToken csrfToken) {
        return Map.of(
                "token", csrfToken.getToken(),
                "headerName", csrfToken.getHeaderName(),
                "parameterName", csrfToken.getParameterName()
        );
    }
}

===================

  import axios from "axios";

export const apiClient = axios.create({
  baseURL: "/api",
  withCredentials: true,
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN",
  headers: {
    "Content-Type": "application/json",
  },
});

=======================
