package com.company.engineeringai.web;

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

public final class EngineeringAiBrowserPanel extends JPanel implements Disposable {

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
                                "Run IntelliJ using the bundled JetBrains Runtime (JBR)."
                        ),
                        BorderLayout.CENTER
                );
                return;
            }

            initializeBrowser(project);

        } catch (Throwable t) {
            LOG.error("Failed to initialize Engineering AI browser", t);

            add(
                    buildFallback(
                            "Failed to initialize Engineering AI UI.\n" +
                            t.getClass().getSimpleName() + ": " + safeMessage(t)
                    ),
                    BorderLayout.CENTER
            );
        }
    }

    private void initializeBrowser(Project project) {
        browser = new JBCefBrowser();

        bridgeQuery = JBCefJSQuery.create(browser);

        EngineeringAiBridge bridge = new EngineeringAiBridge(project);

        bridgeQuery.addHandler(request -> {
            try {
                String response = bridge.handle(request);

                return new JBCefJSQuery.Response(response);

            } catch (Throwable t) {
                LOG.error("Engineering AI bridge request failed", t);

                String errorJson =
                        "{"
                        + "\"ok\":false,"
                        + "\"error\":\""
                        + escapeJson(safeMessage(t))
                        + "\""
                        + "}";

                return new JBCefJSQuery.Response(errorJson);
            }
        });

        String bridgeJs = bridgeQuery.inject(
                "payload",
                "function(response) { onSuccess(response); }",
                "function(errorCode, errorMessage) { "
                        + "onError(errorCode, errorMessage); "
                        + "}"
        );

        String html = resource("/web/index.html")
                .replace(
                        "/*__REACT__*/",
                        resource("/web/vendor/react.production.min.js")
                )
                .replace(
                        "/*__REACT_DOM__*/",
                        resource("/web/vendor/react-dom.production.min.js")
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

        LOG.info("Engineering AI web UI loaded. HTML size=" + html.length());

        browser.loadHTML(html);

        add(browser.getComponent(), BorderLayout.CENTER);

        Disposer.register(this, bridgeQuery);
        Disposer.register(this, browser);

        revalidate();
        repaint();
    }

    private static String resource(String path) {
        try (
                InputStream in =
                        EngineeringAiBrowserPanel.class.getResourceAsStream(path)
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
                    "Unable to load plugin web resource: " + path,
                    ex
            );
        }
    }

    private static JComponent buildFallback(String message) {
        JPanel panel = new JPanel(new BorderLayout());

        JLabel label = new JLabel(
                "<html>"
                        + "<div style='padding:24px'>"
                        + "<h2>Engineering AI</h2>"
                        + message.replace("\n", "<br/>")
                        + "</div>"
                        + "</html>"
        );

        panel.setBorder(
                BorderFactory.createEmptyBorder(
                        20,
                        20,
                        20,
                        20
                )
        );

        panel.add(label, BorderLayout.NORTH);

        return panel;
    }

    private static String safeMessage(Throwable t) {
        String message = t.getMessage();

        return message == null || message.isBlank()
                ? "No message"
                : message;
    }

    private static String escapeJson(String value) {
        if (value == null) {
            return "";
        }

        return value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    @Override
    public void dispose() {
        // JBCefBrowser and JBCefJSQuery are registered
        // with IntelliJ Disposer in initializeBrowser().
    }
}
