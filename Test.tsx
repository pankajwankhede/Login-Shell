# Copilot Task: Fix PROD JSP/JSTL Rendering Issue

## Context

This application is using:

- Spring Boot `4.1.0`
- Java `21`
- Gradle
- JSP views
- WAR packaging for deployment
- Jakarta Servlet/JSP stack

The application works in non-PROD, but in PROD the JSP page is not loading correctly.

The current Gradle configuration mixes/previously mixed old `javax` JSTL dependencies with Jakarta JSTL dependencies, and `tomcat-embed-jasper` is currently configured as `compileOnly`.

Because Spring Boot 4 uses Jakarta APIs, the application must use Jakarta JSTL only.

---

## Required Changes

### 1. Update JSP/JSTL dependencies in `build.gradle`

Replace the existing JSP/JSTL dependency configuration with:

```gradle
// JSP support
implementation 'org.apache.tomcat.embed:tomcat-embed-jasper'

// JSTL - Jakarta only
implementation 'jakarta.servlet.jsp.jstl:jakarta.servlet.jsp.jstl-api:3.0.1'
implementation 'org.glassfish.web:jakarta.servlet.jsp.jstl:3.0.2.redhat-00001'
```

### 2. Remove old javax JSTL dependencies

Remove or keep commented out these dependencies:

```gradle
implementation 'org.apache.taglibs:taglibs-standard-impl:1.2.5'
implementation 'javax.servlet.jsp.jstl:javax.servlet.jsp.jstl-api:1.2.2'
```

Do not add them back anywhere transitively or explicitly.

### 3. Change Jasper dependency scope

Current configuration:

```gradle
compileOnly 'org.apache.tomcat.embed:tomcat-embed-jasper'
```

Change it to:

```gradle
implementation 'org.apache.tomcat.embed:tomcat-embed-jasper'
```

This ensures Jasper is available in the runtime artifact and PROD does not depend on a different external runtime providing it.

---

## JSP Taglib Changes

Search all JSP files for old JSTL taglib declarations.

Use Jakarta JSTL taglib URIs:

```jsp
<%@ taglib prefix="c" uri="jakarta.tags.core" %>
<%@ taglib prefix="fmt" uri="jakarta.tags.fmt" %>
<%@ taglib prefix="fn" uri="jakarta.tags.functions" %>
```

Replace old declarations such as:

```jsp
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
```

where applicable.

Do not introduce any `javax.servlet.*` imports or JSTL dependencies.

---

## Expected Final Gradle Section

The final JSP/JSTL dependency section should look like:

```gradle
// JSP + JSTL support for Spring Boot 4 / Jakarta
implementation 'org.apache.tomcat.embed:tomcat-embed-jasper'
implementation 'jakarta.servlet.jsp.jstl:jakarta.servlet.jsp.jstl-api:3.0.1'
implementation 'org.glassfish.web:jakarta.servlet.jsp.jstl:3.0.2.redhat-00001'
```

There must be no active dependency on:

```text
org.apache.taglibs:taglibs-standard-impl:1.2.5
javax.servlet.jsp.jstl:javax.servlet.jsp.jstl-api:1.2.2
```

---

## Build Verification

Run:

```bash
./gradlew clean bootWar
```

Then inspect the generated WAR:

```bash
jar tf build/libs/authenticate.war | grep -Ei "jstl|jasper"
```

Expected artifacts should include Jakarta JSTL and Jasper, for example:

```text
WEB-INF/lib/jakarta.servlet.jsp.jstl-api-3.0.1.jar
WEB-INF/lib/jakarta.servlet.jsp.jstl-3.0.2.redhat-00001.jar
WEB-INF/lib/tomcat-embed-jasper-*.jar
```

Verify that the WAR does not contain old javax JSTL libraries:

```bash
jar tf build/libs/authenticate.war | grep -i "javax.servlet.jsp.jstl"
```

Expected result: no output.

---

## Dependency Verification

Run:

```bash
./gradlew dependencyInsight \
  --dependency jakarta.servlet.jsp.jstl \
  --configuration runtimeClasspath
```

Run:

```bash
./gradlew dependencyInsight \
  --dependency tomcat-embed-jasper \
  --configuration runtimeClasspath
```

Confirm Jasper and Jakarta JSTL are present on `runtimeClasspath`.

---

## Important: Do Not Modify Nginx Yet

The PROD browser also showed a request similar to:

```text
GET /partnersso/login?realm=RC
404 Not Found
```

The changes in this task are specifically for JSP/JSTL runtime compatibility.

After deploying the JSP/JSTL fix, if PROD still returns HTTP `404`, do not continue changing JSTL libraries.

Instead verify:

1. `/partnersso/login?realm=RC` reaches the Spring controller.
2. `server.servlet.context-path` is correct in PROD.
3. Nginx/Akamai is not adding or stripping `/partnersso` incorrectly.
4. The Spring controller mapping for `/login` is registered in PROD.

A JSTL/JSP compilation problem normally produces a server-side JSP/Jasper exception, often HTTP `500`, after the controller has been reached. A `404` can indicate routing or context-path problems.

---

## Acceptance Criteria

Copilot should make only the required changes and verify that:

- [ ] Project remains on Spring Boot `4.1.0` and Java `21`.
- [ ] Only Jakarta JSTL dependencies are active.
- [ ] Old javax JSTL dependencies are removed.
- [ ] `tomcat-embed-jasper` uses `implementation`, not `compileOnly`.
- [ ] JSP taglibs use Jakarta JSTL URIs.
- [ ] `./gradlew clean bootWar` succeeds.
- [ ] Generated WAR contains Jasper and Jakarta JSTL libraries.
- [ ] Generated WAR does not contain `javax.servlet.jsp.jstl`.
- [ ] No unrelated dependency or routing changes are made as part of this fix.

## Copilot Instruction

Please inspect the repository, implement the above changes, update all affected JSP files consistently, build the project, and report:

1. Files changed.
2. Exact dependency changes.
3. JSP taglib changes.
4. Build result.
5. Any remaining `javax.servlet.jsp.jstl` references found in the repository.
6. Any errors that may still explain the PROD `/partnersso/login?realm=RC` 404.
