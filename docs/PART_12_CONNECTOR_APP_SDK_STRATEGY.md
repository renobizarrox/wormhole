# Part 12 – Connector/App SDK Strategy

This document specifies the **connector/App SDK strategy** (section 12 of the main checklist): the contract that connectors must satisfy, the choice between declarative and code-first models, templates, certification, and version migration. It builds on [PART_2_2_APPS_CONNECTOR_DEFINITIONS.md](./PART_2_2_APPS_CONNECTOR_DEFINITIONS.md) and [PART_2_3_ACTIONS_ENDPOINTS_OPERATIONS.md](./PART_2_3_ACTIONS_ENDPOINTS_OPERATIONS.md) and the Prisma schema (App, AppVersion, Action, Connection).

---

## 1. Connector Contract

A **connector** (App) is defined by metadata, an auth model, and one or more Actions. The platform treats the following as the **connector contract**: the shapes and rules that any valid App/AppVersion and its Actions must conform to so that the control plane and runner can create connections, validate input, and execute actions.

### 1.1 Auth Schema

- **Purpose:** Define how credentials are structured for this connector so the platform can store them (Connection), mask them in UI, and inject them at runtime (runner).
- **Specification:**
  - **Auth type:** One of `API_KEY`, `OAUTH2`, `BASIC`, `CUSTOM_HEADER` (from `AppVersion.authType`). Each type implies a **credential shape**:
    - **API_KEY:** At least one secret field (e.g. `apiKey` or `api_key`). Optional: `apiSecret`, `baseUrl`. Schema can be a JSON Schema in app metadata or a well-known shape per auth type.
    - **OAUTH2:** `clientId`, `clientSecret`, optionally `refreshToken`, `accessToken`, `redirectUri`. Token refresh flow may be documented separately (e.g. refresh endpoint, grant type).
    - **BASIC:** `username`, `password` (or equivalent).
    - **CUSTOM_HEADER:** Name-value pairs for headers (e.g. `Authorization: Bearer <token>`, `X-API-Key: <key>`). Schema describes header names and which are secret.
  - **Connection credential schema:** The platform may store a **connection credential schema** per AppVersion (e.g. in `AppVersion.settingsSchema` or a dedicated `connectionCredentialSchema` JSON). This schema describes the fields the user must supply when creating a Connection (e.g. required/optional, types, which fields are secrets). The runner and test-connection logic use this to know which values to decrypt and how to pass them (headers, query, body).
- **Contract:** For each `AuthType`, the platform expects a well-defined set of credential fields. Connector authors (or the UI) must provide credentials that match; the platform encrypts and stores them and never returns plaintext.

### 1.2 Action Schema

- **Purpose:** Define each operation (Action) so the runner can build the HTTP request and validate input/output.
- **Specification (maps to Prisma `Action` and related):**
  - **Identity:** `key` (unique per AppVersion), `name`, `description`.
  - **HTTP:** `method`, `endpointTemplate` (path with optional placeholders), `headersTemplate`, `querySchema`, `pathSchema`, `bodySchema` (JSON Schema for query params, path params, request body). Optional `outputSchema` for response validation or documentation.
  - **Behavior:** `retryStrategy`, `maxAttempts`, `initialDelayMs`, `maxDelayMs`, `timeoutMs`.
- **Contract:** All Actions under an AppVersion must have valid JSON Schema (or null) for `bodySchema`/`querySchema`/`pathSchema` where the runner expects them. The runner uses these to validate input before calling the external API and optionally to validate or document the response.

### 1.3 Validation Hooks

- **Purpose:** Points in the lifecycle where the platform validates connector definitions so invalid config is caught early.
- **Specification:**
  - **On save (create/update App or Action):** Validate that auth type is one of the allowed enum values; that credential schema (if stored) is valid JSON Schema; that Action schemas (body, query, path) are valid JSON Schema; that endpoint template is well-formed and path/query placeholders match pathSchema/querySchema if present.
  - **On publish:** Re-run validation; optionally run a quick “dry run” or schema-only check. Fail publish if validation fails.
  - **On test connection:** Validate that the Connection has all required credential fields (per auth type) before calling the test endpoint.
  - **On run (step execution):** Validate step input against the Action’s bodySchema/querySchema/pathSchema before sending the request. Return a clear validation error to the run if input does not conform.
- **Contract:** The platform provides these validation points; connector authors must supply definitions that pass validation (schemas, templates, required fields).

### 1.4 Test Hooks

- **Purpose:** Allow connector authors and users to verify that a Connection or Action works before using it in production workflows.
- **Specification:**
  - **Test connection:** The platform calls a **test connection** flow: using the stored (decrypted) credentials for a Connection, perform a minimal authenticated request to the external API (e.g. GET a known endpoint or a dedicated “ping” endpoint). Success/failure and optional diagnostics are returned. The connector contract can define an optional **test endpoint** or **test action** (e.g. a specific Action key like `ping` or `get_me`) that the platform will call for “Test connection.” If not defined, the platform may use a default (e.g. first GET action or a configurable test URL in app metadata).
  - **Test action:** The platform supports **test action**: run a single Action with user-supplied input (and the chosen Connection). The runner executes the Action once and returns the result. This validates that the Action definition, Connection, and input schema work together.
- **Contract:** Connectors can optionally specify a preferred test endpoint or test action for “Test connection”; the platform must support at least one way to test connections and to test actions with sample input.

---

## 2. Declarative vs Code-First Connector Model

- **Declarative (recommended for MVP):** Connectors are defined entirely by **data**: App and AppVersion metadata (name, auth type, settings schema) and Action definitions (method, endpoint template, schemas, retry/timeout) stored in the database. Authors use the **UI** (or import YAML/JSON) to create and edit Apps and Actions. No custom code is deployed per connector; the **runner** is generic and interprets the stored definitions to build HTTP requests and handle responses.
  - **Pros:** Simpler operations, no connector-specific deployment, easier audit and versioning, UI-driven.
  - **Cons:** Advanced logic (e.g. custom token refresh, response transformation) may require platform features or workarounds.

- **Code-first (optional / post-MVP):** Connectors are implemented as **code** (e.g. a small Node or Python module) that implements a fixed interface: e.g. “given credentials and action key + input, return request config” or “given credentials, perform test.” The platform could invoke this code (e.g. in a sandbox or as part of the runner) instead of purely interpreting declarative definitions.
  - **Pros:** Full flexibility for complex auth flows, custom validation, or non-HTTP integrations.
  - **Cons:** More operational burden (build, deploy, secure execution of connector code).

- **Decision:** **Declarative first.** The MVP connector model is declarative: App + AppVersion + Actions stored in the DB, runner interprets them. Code-first can be added later as an extension (e.g. “custom connector runtime” or plugin) when needed.

---

## 3. Templates and Examples for Common APIs

- **Purpose:** Speed up connector creation and demonstrate best practices for target platforms (NetSuite, Shopify, ServiceTitan, SAP, Microsoft Dynamics, etc.).
- **Specification:**
  - **Templates:** Provide **connector templates** (e.g. YAML or JSON files, or seed data) that define:
    - App metadata (name, key, vendor, auth type).
    - AppVersion with auth type and (if needed) connection credential schema.
    - A small set of representative Actions (e.g. “Get record,” “Create record,” “List”) with endpoint templates and JSON Schema for body/query.
  - **Location:** Store in repo under e.g. `connector-templates/` or `docs/connector-examples/`. Document how to import them (UI import or API) and how to adapt them for a specific tenant.
  - **Target APIs:** At least one example per category (e.g. REST with API Key, REST with OAuth2, REST with Basic) so authors can copy and adjust. Prioritize the platforms listed in Part 1 (NetSuite, Shopify, ServiceTitan, SAP, Dynamics) when creating examples.
- **Contract:** The platform documents the expected format of a template (e.g. App + AppVersion + Actions as JSON); templates conform to the connector contract (auth schema, action schema).

---

## 4. Connector Certification Checklist (Quality Gate)

- **Purpose:** A **quality gate** that a connector should pass before it is considered “certified” or ready for production use (e.g. publishable, or listed in a catalog).
- **Specification – certification checklist:**
  1. **Auth and connection:** Auth type and credential schema defined; at least one Connection can be created and “Test connection” succeeds.
  2. **Actions:** At least one Action defined; input schemas (body/query/path) are valid JSON Schema; “Test action” succeeds with sample input for at least one Action.
  3. **Validation:** All validation hooks pass (on save, on publish); no required fields missing.
  4. **Documentation:** App has name, description; Actions have name and optional description; any required env or setup (e.g. OAuth app registration) is documented.
  5. **Security:** No secrets in logs or in action definitions; credential fields marked as secret in schema.
  6. **Versioning:** App has at least one published version; version number and publishedAt set.
- **Process:** Before marking an App as “Certified” (or before allowing publish to a shared catalog), a human or automated check runs this list. The platform can expose a “Certification status” (e.g. pass/fail + list of unmet items) in the UI or API.

---

## 5. Version Migration Policy for App/Action Changes

- **Purpose:** Define how breaking vs non-breaking changes are handled when updating Apps and Actions so existing Connections and Workflows keep working or are migrated safely.
- **Specification:**
  - **Non-breaking (additive):** New optional fields in credential schema, new optional Action input fields, new Actions, new AppVersion (higher version number) with additive changes only. Existing Connections and Workflows that reference the previous version continue to work; new Connections/Workflows can use the new version.
  - **Breaking changes:** Removing or renaming required credential fields, changing Action key or removing required input fields, changing endpoint or method in a way that changes behavior. Strategy:
    - **New version:** Introduce a new AppVersion (e.g. v2) with the breaking change. Keep the old AppVersion available for existing workflows but mark it **deprecated** (e.g. `App.status` or version-level deprecation). Document migration path (e.g. “Re-create Connection using v2; update workflow steps to use v2 Actions”).
    - **Deprecation window:** Communicate deprecation and end-of-support date for the old version; after that date, runs using deprecated versions may be blocked or warned.
  - **Action-level changes:** Actions are tied to AppVersion. Changing an Action’s schema or endpoint in place can break in-flight or saved workflows. Prefer creating a new AppVersion and defining updated Actions there; treat in-place edits as “draft” only until published, and document that publishing a new version may require workflow updates.
- **Contract:** The platform supports multiple AppVersions per App; workflows and Connections reference AppVersion (or “latest published”). Migration policy is documented for connector authors and tenants (e.g. in docs or in-app help).

---

## 6. Summary: Checklist 12 Compliance

| Checklist item | Specification |
|----------------|----------------|
| Define connector contract: auth schema | Credential shape per AuthType; connection credential schema for required/secret fields. |
| Define connector contract: action schema | Action identity, HTTP (method, endpoint, headers, query/path/body schemas), retry/timeout; valid JSON Schema. |
| Define connector contract: validation hooks | On save, publish, test connection, and run: validate schemas and required fields. |
| Define connector contract: test hooks | Test connection (minimal authenticated request or test action); test action with sample input. |
| Decide declarative vs code-first | Declarative first; code-first optional post-MVP. |
| Provide templates/examples for common APIs | Templates (YAML/JSON or seed) in repo; at least one per auth style; target NetSuite, Shopify, etc. |
| Add connector certification checklist | Quality gate: auth, actions, validation, docs, security, versioning; pass before certified/publish. |
| Add version migration policy for app/action changes | Additive = new version/deprecate old; breaking = new AppVersion, deprecation window, migration path. |

This completes **12) Connector/App SDK Strategy Checklist**.
