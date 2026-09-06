# Engineering AI IntelliJ Plugin Cross-Check Guide

Use this guide when the IntelliJ Engineering AI plugin cannot load MCP tools, cannot connect to the MCP server, or shows an error such as:

```text
ERROR loading MCP tools
MCP error: null
```

## 1. Verify Plugin Configuration

Open:

```text
Settings
→ Engineering AI
```

Recommended local test configuration:

```text
Mode:
DIRECT_MCP

Enable LLM:
false

MCP Server URL:
http://localhost:8080/mcp

Use Central Knowledge:
true

Central Knowledge Label:
Bitbucket company-ai-agent

Include Current File:
true

Include Selected Code:
true
```

Do not configure Bitbucket credentials in the IntelliJ plugin.

The plugin should only know the MCP server URL.

---

## 2. Expected Architecture

```text
IntelliJ Plugin
      |
      | current code / selected code
      v
engineering-mcp-server
      |
      +-- Bitbucket company-ai-agent
      +-- Splunk           optional
      +-- New Relic        optional
      +-- PCF              optional
      +-- Oracle           optional
      +-- SQL Server       optional
      +-- Jenkins          optional
```

---

## 3. Verify MCP Server URL

Example:

```text
http://localhost:8080/mcp
```

Make sure the plugin does not point only to:

```text
http://localhost:8080
```

unless that is the actual MCP endpoint.

---

## 4. Test MCP `initialize`

From the same machine where IntelliJ is running:

```bat
curl -i -X POST http://localhost:8080/mcp ^
  -H "Content-Type: application/json" ^
  -H "Accept: application/json, text/event-stream" ^
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-03-26\",\"capabilities\":{},\"clientInfo\":{\"name\":\"engineering-ai-intellij\",\"version\":\"1.0.0\"}}}"
```

Expected:

- HTTP 200
- valid JSON-RPC
- `result` is present
- no JSON-RPC `error`

---

## 5. Check MCP Response Headers

Record:

```text
HTTP Status:
Content-Type:
Mcp-Session-Id:
```

If the server returns:

```text
Mcp-Session-Id
```

the plugin may need to send the same value on later requests.

If the server returns:

```text
Content-Type: text/event-stream
```

the plugin must support MCP Streamable HTTP / SSE.

---

## 6. Test `tools/list`

```bat
curl -i -X POST http://localhost:8080/mcp ^
  -H "Content-Type: application/json" ^
  -H "Accept: application/json, text/event-stream" ^
  -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\",\"params\":{}}"
```

If a session is required:

```bat
curl -i -X POST http://localhost:8080/mcp ^
  -H "Content-Type: application/json" ^
  -H "Accept: application/json, text/event-stream" ^
  -H "Mcp-Session-Id: YOUR_SESSION_ID" ^
  -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\",\"params\":{}}"
```

Expected shape:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "search_shared_docs",
        "description": "Search centralized engineering knowledge",
        "inputSchema": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string"
            }
          }
        }
      }
    ]
  }
}
```

---

## 7. Direct MCP Mode When LLM Is Disabled

When:

```text
Enable LLM = false
```

the plugin should not depend on a hardcoded:

```text
engineering_ask
```

unless the MCP server actually exposes that tool.

Correct flow:

```text
Refresh MCP Tools
    ↓
initialize
    ↓
tools/list
    ↓
show tools in dropdown
    ↓
user selects tool
    ↓
tools/call
```

Example:

```text
MCP Tool:
search_shared_docs

Arguments:
{
  "query": "spring boot security"
}
```

---

## 8. Expected Tools With Bitbucket-Only Knowledge Enabled

If only centralized Bitbucket knowledge is enabled, expected tools may include:

```text
search_shared_docs
get_agent
get_instruction
get_skill
get_service_context
```

Disabled tools should not appear:

```text
search_splunk
search_new_relic
get_pcf_app_status
query_oracle
query_sql_server
get_jenkins_build
```

---

## 9. Improve `MCP error: null`

The plugin should log the real exception.

Example:

```java
catch (Exception e) {
    String message = e.getMessage();

    if (message == null || message.isBlank()) {
        message = e.getClass().getName();
    }

    LOG.error("Failed to load MCP tools", e);

    showError(
        "MCP error: " + message +
        "\nException: " + e.getClass().getName()
    );
}
```

For HTTP failures, log:

```text
status
Content-Type
response body
exception class
exception message
```

Never log tokens or passwords.

---

## 10. Watch MCP Server Logs

When clicking:

```text
Refresh MCP Tools
```

you should see:

```text
POST /mcp
method=initialize
```

followed by:

```text
POST /mcp
method=tools/list
```

Interpretation:

```text
No request reaches server
→ plugin URL/network problem

initialize reaches server, tools/list does not
→ initialization/session problem

tools/list reaches server and fails
→ server tool registration problem

tools/list succeeds server-side but IntelliJ fails
→ plugin parsing/SSE/session problem
```

---

## 11. Build and Test

Development sandbox:

```bat
gradlew.bat runIde
```

Create installable plugin:

```bat
gradlew.bat clean buildPlugin
```

Generated ZIP:

```text
build\distributions\
```

---

## Quick Plugin Diagnosis

| Symptom | Likely Cause |
|---|---|
| Connection refused | MCP server/port |
| 404 | Wrong MCP path |
| 401/403 | Authentication |
| 415 | Content-Type |
| 406 | Accept header |
| tools/list empty | Server tools disabled/not registered |
| curl works but plugin fails | Client session/SSE/parser issue |
| MCP error: null | Plugin error handling hides real exception |
