# Part 1 – Product Scope and Success Criteria

This document defines the product vision, primary outcomes, and MVP success metrics for the SaaS Integration Platform (Wormhole). It is the single source of truth for **what** we are building and **how we will know** the MVP has succeeded.

---

## Vision

1. **Build a multi-tenant iPaaS-style platform** that lets users integrate any system with any other system. The product is cloud-hosted, multi-tenant, and exposes a consistent model: **Apps** (connectors), **Actions** (operations per app), and **Workflows** (triggers + action steps) with isolated execution.

2. **Support custom connector onboarding** for a wide range of platforms. Out of the gate we target (and will support) connectors for:
   - NetSuite  
   - Shopify  
   - ServiceTitan  
   - SAP  
   - Microsoft Dynamics  
   and any future system that can be integrated via APIs. New platforms are added as **Apps**; each API operation is an **Action**. Users can add, edit, and use these Apps and Actions without code changes to the core platform.

---

## Primary Outcomes

The MVP is successful only if the following outcomes are true for users:

| # | Outcome | Definition of “done” |
|---|--------|----------------------|
| 1 | **Users can create, edit, and delete Apps** | Users have a UI and/or API to define new Apps (connectors), update metadata (name, slug, vendor, auth type, etc.), and remove Apps. Apps are the unit of “integration platform” (e.g. NetSuite, Shopify). |
| 2 | **Users can create, edit, and delete Actions under each App** | Every App can have one or more Actions. Users can add new Actions (endpoint, method, input/output schema), edit them, and delete them. Actions are the callable operations (e.g. “Create customer”, “Get order”). |
| 3 | **Users can store encrypted credentials per tenant/app connection** | For each App, a user (within a tenant) can create a **Connection** and store credentials (API keys, OAuth tokens, etc.) securely. Credentials are encrypted at rest and never exposed in logs or UI in plaintext. |
| 4 | **Users can test Actions manually with input payloads** | Users can run a single Action with sample inputs (and the chosen Connection) and see the result. This is used to validate configuration and credentials before using the Action in a Workflow. |
| 5 | **Users can build Workflows from Triggers and Action steps** | Users can create Workflows that start from a Trigger (manual, webhook, or schedule) and execute a sequence of Action steps. Workflows are defined, saved, and versioned. |
| 6 | **Workflows execute step-by-step with deterministic run states and logs** | Each run of a Workflow is a **WorkflowRun** with a clear state (e.g. running, success, failed). Each step has its own state and logs. Users can inspect runs and step-level outcomes for debugging and auditing. |

---

## MVP Success Metrics

We will measure MVP success with the following metrics. “MVP complete” implies these are met or have a plan to be met before launch.

| Metric | Target | How we measure |
|--------|--------|-----------------|
| **Production-ready connectors** | At least 5 | Number of Apps that are published, have at least one working Action, and have been tested with real credentials in staging/production. |
| **Successful execution rate** | ≥ 95% for valid workflows | Of all WorkflowRuns that are triggered with valid config and no external outage, ≥ 95% complete successfully (excluding user-cancelled or invalid input). |
| **Trigger-to-start latency** | p95 &lt; 5 seconds | Time from trigger event (manual click, webhook received, cron tick) to the moment the run is marked “running” (or first step starts). p95 over a rolling window (e.g. 7 days). |
| **Execution logs availability** | 100% of runs | Every WorkflowRun has logs (run-level and step-level) persisted and available for at least the retention period (e.g. 30 days). No “missing logs” for completed or failed runs. |
| **Multi-tenant data isolation** | Validated by tests | Automated tests (e.g. integration or E2E) prove that Tenant A cannot read or write Tenant B’s Apps, Actions, Connections, Workflows, or Runs. No data leaks between tenants. |

---

## Scope boundaries (MVP)

- **In scope for MVP:** Apps, Actions, Connections, Workflows, Triggers (manual, webhook, cron), step-by-step execution, run history and logs, multi-tenant isolation, RBAC (Owner/Admin/Builder/Viewer).
- **Out of scope for MVP (post-MVP):** Conditional branching/loops in workflows, visual data mapper, marketplace, SSO/SAML, region-based data residency, usage-based billing.

---

## Sign-off

Part 1 is **complete** when:

- [x] Vision is written and agreed (this document).
- [x] Primary outcomes are listed and defined (this document).
- [x] MVP success metrics are defined with targets and measurement method (this document).
- [ ] Stakeholders have reviewed and accepted this scope (optional step; can be done in parallel with development).

Once Part 1 is accepted, development follows the Build Order in the main checklist (Foundation → Connector Core → Workflow Core → etc.).
