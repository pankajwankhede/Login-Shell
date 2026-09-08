package com.company.engineeringai.web;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.intellij.openapi.Disposable;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.util.Disposer;
import com.intellij.ui.jcef.JBCefApp;
import com.intellij.ui.jcef.JBCefBrowser;
import com.intellij.ui.jcef.JBCefJSQuery;

import javax.swing.*;
import java.awt.*;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public final class EngineeringAiBrowserPanel
        extends JPanel
        implements Disposable {

    private static final Logger LOG =
            Logger.getInstance(EngineeringAiBrowserPanel.class);

    private JBCefBrowser browser;
    private JBCefJSQuery bridgeQuery;

    public EngineeringAiBrowserPanel(Project project) {
        super(new BorderLayout());

        try {
            if (!JBCefApp.isSupported()) {
                add(
                        buildFallback(
                                "JCEF is not available in this IDE runtime.\n" +
                                "Run IntelliJ using bundled JetBrains Runtime."
                        ),
                        BorderLayout.CENTER
                );
                return;
            }

            initializeBrowser(project);

        } catch (Throwable t) {

            LOG.error(
                    "Failed to initialize Engineering AI browser",
                    t
            );

            add(
                    buildFallback(
                            "Failed to initialize browser: "
                                    + t.getClass().getSimpleName()
                                    + "\n"
                                    + safeMessage(t)
                    ),
                    BorderLayout.CENTER
            );
        }
    }

    private void initializeBrowser(Project project) {

        browser = new JBCefBrowser();

        bridgeQuery = JBCefJSQuery.create(browser);

        EngineeringAiBridge bridge =
                new EngineeringAiBridge(project);

        /*
         * IMPORTANT:
         *
         * Do NOT return JBCefJSQuery.Response.
         *
         * Result is sent back to React explicitly by executing JS.
         */
        bridgeQuery.addHandler(rawRequest -> {

            String requestId = null;

            try {

                JsonObject wrapper =
                        JsonParser.parseString(rawRequest)
                                .getAsJsonObject();

                requestId =
                        wrapper.get("requestId").getAsString();

                String requestJson =
                        wrapper.get("request").toString();

                String response =
                        bridge.handle(requestJson);

                sendSuccessToReact(
                        requestId,
                        response
                );

            } catch (Throwable t) {

                LOG.error(
                        "Engineering AI bridge request failed",
                        t
                );

                sendErrorToReact(
                        requestId,
                        safeMessage(t)
                );
            }

            // Required for compatibility with runtime that
            // doesn't expose JBCefJSQuery.Response.
            return null;
        });

        /*
         * This produces the native JCEF query invocation.
         * JavaScript will call:
         *
         * window.__engineeringAiSend(payload)
         */
        String queryCall =
                bridgeQuery.inject("payload");

        String bridgeJs = """

            window.__engineeringAiSend = function(payload) {
                %s
            };

            """.formatted(queryCall);

        String html =
                resource("/web/index.html")
                        .replace(
                                "/*__REACT__*/",
                                resource(
                                        "/web/vendor/react.production.min.js"
                                )
                        )
                        .replace(
                                "/*__REACT_DOM__*/",
                                resource(
                                        "/web/vendor/react-dom.production.min.js"
                                )
                        )
                        .replace(
                                "/*__APP_CSS__*/",
                                resource("/web/app.css")
                        )
                        .replace(
                                "/*__APP_JS__*/",
                                resource("/web/app.js")
                        )
                        .replace(
                                "/*__JAVA_BRIDGE__*/",
                                bridgeJs
                        );

        browser.loadHTML(html);

        add(
                browser.getComponent(),
                BorderLayout.CENTER
        );

        Disposer.register(this, bridgeQuery);
        Disposer.register(this, browser);
    }

    private void sendSuccessToReact(
            String requestId,
            String responseJson
    ) {

        if (requestId == null) {
            return;
        }

        String js =
                "window.__engineeringAiResolve("
                        + quoteJs(requestId)
                        + ","
                        + quoteJs(responseJson)
                        + ");";

        executeJavascript(js);
    }

    private void sendErrorToReact(
            String requestId,
            String error
    ) {

        if (requestId == null) {
            return;
        }

        String js =
                "window.__engineeringAiReject("
                        + quoteJs(requestId)
                        + ","
                        + quoteJs(error)
                        + ");";

        executeJavascript(js);
    }

    private void executeJavascript(String js) {

        SwingUtilities.invokeLater(() -> {

            try {

                browser.getCefBrowser()
                        .executeJavaScript(
                                js,
                                browser.getCefBrowser().getURL(),
                                0
                        );

            } catch (Throwable t) {

                LOG.error(
                        "Unable to execute JavaScript callback",
                        t
                );
            }
        });
    }

    private static String quoteJs(String value) {

        if (value == null) {
            return "null";
        }

        return "\""
                + value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\r", "\\r")
                .replace("\n", "\\n")
                + "\"";
    }

    private static String resource(String path) {

        try (
                InputStream in =
                        EngineeringAiBrowserPanel.class
                                .getResourceAsStream(path)
        ) {

            if (in == null) {

                throw new IllegalStateException(
                        "Missing plugin resource: " + path
                );
            }

            return new String(
                    in.readAllBytes(),
                    StandardCharsets.UTF_8
            );

        } catch (Exception ex) {

            throw new IllegalStateException(
                    "Unable to load plugin web resource: "
                            + path,
                    ex
            );
        }
    }

    private static JComponent buildFallback(
            String message
    ) {

        JPanel panel =
                new JPanel(new BorderLayout());

        JLabel label =
                new JLabel(
                        "<html>"
                                + "<div style='padding:24px'>"
                                + "<h2>Engineering AI</h2>"
                                + message.replace(
                                        "\n",
                                        "<br/>"
                                )
                                + "</div>"
                                + "</html>"
                );

        panel.add(
                label,
                BorderLayout.NORTH
        );

        return panel;
    }

    private static String safeMessage(Throwable t) {

        String message = t.getMessage();

        return message == null
                || message.isBlank()
                ? "No message"
                : message;
    }

    @Override
    public void dispose() {
        // Registered through IntelliJ Disposer.
    }
}
