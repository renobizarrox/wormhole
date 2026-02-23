# Part 11 – Security Specification

This document specifies the **security specification** (section 11 of the main checklist) for the SaaS Integration Platform. It defines authentication options, secret management, webhook security, optional network controls, and pen-test readiness. It aligns with [PART_3_NON_FUNCTIONAL_REQUIREMENTS.md](./PART_3_NON_FUNCTIONAL_REQUIREMENTS.md) (security NFRs) and the data model ([PART_6_DATA_MODEL_SPECIFICATION.md](./PART_6_DATA_MODEL_SPECIFICATION.md)).

---

## 1. OAuth2/OIDC Integration for User Auth

- **Scope:** Allow users to sign in with an identity provider (IdP) via OAuth2 or OpenID Connect (OIDC), in addition to or instead of email/password.
- **Specification:**
  - **MVP:** Email/password + JWT (current design) is sufficient. OAuth2/OIDC is **optional for MVP** and can be added as a parallel login path.
  - **When implemented:** Support at least one OIDC provider (e.g. Google, Azure AD, Okta). Flow: redirect to IdP → callback with auth code → exchange for tokens → create or link User and Membership, issue platform JWT with Hasura claims. Store IdP subject (and optionally refresh token) for the user.
  - **Hasura:** JWT from IdP can be passed through if it includes Hasura claims, or the Node auth service issues a platform JWT after validating the IdP token.
- **Checklist:** OAuth2/OIDC is **specified** here; implement when required (post-MVP or when SSO is a requirement).

---

## 2. JWT/Session Security Controls

- **Scope:** Secure issuance, validation, and handling of JWTs used for API and GraphQL access.
- **Specification (already in place or to enforce):**
  - **Issuance:** JWT signed with a strong secret (HS256) or asymmetric key (RS256). Include only necessary claims: `sub` (userId), `x-hasura-user-id`, `x-hasura-tenant-id`, `x-hasura-role`, and `exp` (short-lived, e.g. 1–24 hours).
  - **Validation:** All protected routes and Hasura validate signature and expiry; reject expired or invalid tokens (401).
  - **Storage:** Frontend stores JWT in memory or httpOnly cookie; avoid localStorage if possible to reduce XSS token theft risk. No sensitive data in JWT payload beyond what’s needed for authz.
  - **Refresh:** If refresh tokens are used, store them securely (httpOnly cookie or secure backend); rotate on use and revoke on logout.
- **Checklist:** JWT/session security controls are specified and implemented (auth plugin, expiry, Hasura claims).

---

## 3. RBAC Enforcement in Middleware and Service Layer

- **Scope:** Role-based access control so that only allowed roles can perform certain operations.
- **Specification (already in place):**
  - **Roles:** Owner, Admin, Builder, Viewer (and optionally custom). Stored in Membership; included in JWT as `x-hasura-role`.
  - **Middleware:** Node API uses `requireRole()` (or equivalent) so that routes like tenants list, invite, or admin actions are restricted by role. Hasura permissions map roles to select/insert/update/delete rules per table and column.
  - **Service layer:** Actions (invite, publish, run workflow, cancel) check role before performing; Hasura Actions receive role in session and enforce in handler.
- **Checklist:** RBAC is specified and enforced in middleware and service layer.

---

## 4. Secrets Encrypted Using KMS or Vault Transit Encryption

- **Scope:** Connection credentials and webhook secrets must be encrypted at rest using a key management service (KMS) or Vault transit engine, not a single application key in env.
- **Specification:**
  - **What to encrypt:** `Connection.secretCipher`, `Trigger.webhookSecretCipher`. Encrypt before writing to DB; decrypt only in the process that needs them (test connection, run execution, webhook verification).
  - **How:** Use a KMS (e.g. AWS KMS, GCP KMS) or HashiCorp Vault transit encryption. Application calls KMS/Vault to encrypt plaintext before storing in PostgreSQL and to decrypt when reading. No long-term storage of plaintext secrets in app memory beyond the request lifecycle.
  - **Key rotation:** Support key version in metadata so that re-encryption can be done when rotating KMS keys; document rotation procedure.
- **Checklist:** Specification is complete; implementation uses KMS or Vault for encrypt/decrypt of connection and webhook secrets.

---

## 5. Zero Plaintext Secrets in Logs

- **Scope:** No passwords, API keys, tokens, or decrypted connection/webhook secrets may appear in application logs.
- **Specification:**
  - **Logging rules:** Never log request/response bodies that may contain credentials; never log `secretCipher`, `webhookSecretCipher`, or their decrypted values. Log only opaque identifiers (e.g. connectionId, triggerId) and redacted or truncated values (e.g. "secretCipher: [REDACTED]" or last 4 chars for debugging only if policy allows).
  - **Error messages:** Do not include secrets in error messages or stack traces returned to clients or written to logs.
  - **Enforcement:** Code review and automated checks (e.g. grep or static analysis for patterns like `log(.*secret`) in CI; test that connection/test API and webhook paths do not log secrets (see Part 10).
- **Checklist:** Zero plaintext secrets in logs is specified; enforce via policy, review, and tests.

---

## 6. Signed Webhooks with Replay Protection

- **Scope:** Incoming webhooks must be verified by signature and, where feasible, protected against replay.
- **Specification:**
  - **Signature:** Verify HMAC (e.g. HMAC-SHA256) using the webhook secret stored in `Trigger.webhookSecretCipher`. Compare using constant-time comparison. Reject requests with missing or invalid signature (401/403).
  - **Replay protection:** Option A: Accept a timestamp (or nonce) in header or body; reject if timestamp is too old (e.g. > 5 minutes). Option B: Store recently seen nonces (or request signatures) in Redis with TTL and reject duplicates. Document which approach is used and configure tolerance (e.g. 5-minute window).
  - **Idempotency:** Webhook handler can use `WorkflowRun.idempotencyKey` (e.g. derived from signature or client-provided idempotency header) to avoid creating duplicate runs for the same event.
- **Checklist:** Signed webhooks with replay protection are specified; implement signature verification and one of the replay protections above.

---

## 7. IP Allowlist/Denylist Controls (Optional Enterprise)

- **Scope:** Optionally restrict which IPs can access the API or webhook endpoints (allowlist) or block known bad actors (denylist).
- **Specification:**
  - **Optional:** Not required for MVP. Specify for enterprise or high-security deployments.
  - **When implemented:** Configuration (env or config file) for allowed IP ranges or CIDRs for webhook intake and/or admin API. Middleware or reverse proxy (e.g. nginx, Coolify) checks source IP and returns 403 if not allowed. Denylist: block specific IPs or ranges.
  - **Coolify/network:** Can be implemented at load balancer or firewall level rather than in application code.
- **Checklist:** IP allowlist/denylist is specified as optional; implement when required for enterprise.

---

## 8. Pen-Test Readiness Checklist

- **Scope:** A short checklist so the product is ready for external penetration testing and remediation of findings.
- **Specification – readiness checklist:**
  1. **Authentication:** No default credentials; password policy (min length, complexity) documented and enforced; JWT expiry and refresh documented.
  2. **Authorization:** RBAC and tenant isolation documented; tests prove Tenant A cannot access Tenant B data (Part 10).
  3. **Secrets:** No secrets in code or logs; KMS/Vault used for connection and webhook secrets; env vars for app secrets (Coolify/secrets).
  4. **TLS:** HTTPS only in production; TLS 1.2+; no mixed content.
  5. **Input validation:** All API and GraphQL inputs validated (Zod, JSON Schema); SQL parameterized (Prisma); XSS protections (Nuxt/Vuetify).
  6. **Webhooks:** Signature verification and replay protection enabled; rate limiting on webhook endpoints.
  7. **Dependencies:** No known high/critical CVEs in production deps (npm audit, pip-audit, image scan in CI).
  8. **Error handling:** No stack traces or internal details returned to clients in production; generic messages for auth failures.
  9. **Security headers:** Consider CSP, X-Frame-Options, HSTS where applicable (Nuxt/Coolify).
  10. **Documentation:** Runbook for handling security incidents; contact for responsible disclosure.
- **Checklist:** Pen-test readiness checklist is specified; complete items before scheduling a pen-test and remediate findings.

---

## 9. Summary: Checklist 11 Compliance

| Checklist item | Specification |
|----------------|---------------|
| OAuth2/OIDC integration for user auth | Specified as optional for MVP; flow and Hasura integration described for when implemented. |
| JWT/session security controls | Specified and implemented: signed JWT, expiry, Hasura claims, secure storage. |
| RBAC enforcement in middleware and service layer | Specified and implemented: roles in JWT, Hasura permissions, Node middleware. |
| Secrets encrypted using KMS or Vault transit encryption | Specified: encrypt Connection and Trigger secrets with KMS/Vault; decrypt only at use. |
| Zero plaintext secrets in logs | Specified: never log secrets; redact; enforce via review and tests. |
| Signed webhooks with replay protection | Specified: HMAC verification, constant-time compare; timestamp/nonce or idempotency for replay. |
| IP allowlist/denylist controls (optional enterprise) | Specified as optional; implementation approach (config, middleware or LB) described. |
| Pen-test readiness checklist | Specified: 10-point checklist (auth, authz, secrets, TLS, validation, webhooks, deps, errors, headers, docs). |

This completes **11) Security Specification Checklist**.
