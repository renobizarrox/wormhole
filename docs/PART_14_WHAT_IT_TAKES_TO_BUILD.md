# Part 14 – What It Takes to Build (People, Time, Deliverables)

This document specifies **what it takes to build** the SaaS Integration Platform (section 14 of the main checklist): recommended team composition, timeline phases, and core deliverables. It supports planning and resourcing decisions.

---

## 1. Team Composition (Recommended)

- **Purpose:** Define the roles needed to deliver the platform from foundation through production baseline.
- **Specification:**

| Role | Count | Focus |
|------|--------|--------|
| **Product Manager** | 1 | Requirements, prioritization, stakeholder alignment, acceptance criteria. |
| **Tech Lead / Architect** | 1 | Architecture decisions, data model, API design, cross-team alignment, technical risk. |
| **Backend Engineers (Node)** | 2 | Node API, Hasura integration, auth, Actions, webhooks, queue integration, DB migrations. |
| **Backend/Platform Engineers (Python + execution)** | 2 | Python runner, containerized execution, queue consumers, external API calls, log writing, retry/timeout. |
| **Frontend Engineer (Nuxt)** | 1 | Nuxt 3 + Vuetify UI: apps, actions, connections, workflow canvas, runs, triggers, auth/tenant UX. |
| **DevOps/SRE Engineer** | 1 | Coolify, Docker/Compose, CI/CD, DB/Redis/MongoDB ops, observability, runbooks. |
| **QA/Automation Engineer** | 1 | Test strategy, unit/integration/E2E tests, load and security testing, release validation. |
| **Designer** | 1 (part-time) | UX and visual design for key flows (workflow builder, run monitor, connection forms). |

- **Total:** ~9 FTE (8 full-time + 1 part-time designer). Smaller teams can merge roles (e.g. Tech Lead + one Node engineer, or DevOps + QA) with a longer timeline.
- **Checklist:** Team composition is specified; adjust based on org constraints and phase.

---

## 2. Timeline Estimate (Realistic Baseline)

- **Purpose:** Provide a phased timeline from zero to a strong production baseline.
- **Specification:**

| Phase | Duration | Scope |
|-------|----------|--------|
| **Phase 0 – Foundation** | 3–5 weeks | Repo structure, coding standards, auth (register/login/JWT), tenants, RBAC, core entities (Tenant, User, Membership, App, AppVersion, Action, Connection, Workflow, Trigger, WorkflowRun, StepRun), DB migrations, basic API (REST + GraphQL surface). |
| **Phase 1 – MVP** | 8–12 weeks | Connector CRUD, connection management and secret vaulting, manual action test; workflow schema and versioning; trigger handlers (manual, webhook, cron); run state machine and logs; Python runner and queue integration; containerized run lifecycle (Docker/Kubernetes Jobs); frontend: app/action/connection/workflow/run UX; hardening: tests, security baseline, observability. |
| **Phase 2 – Scale + Hardening** | 8–12 weeks | Performance and load testing; scale tuning (queue, runner pool, DB); security controls and scanning; quotas and rate limits; autoscaling; operational dashboards, alerts, runbooks; backup/restore and DR; documentation (developer, operator, admin). |
| **Phase 3 – Ecosystem + Enterprise** | Ongoing | Conditional branches/loops, data mapper, marketplace, SSO/SAML, region residency, billing/metering (per Part 1 optional enhancements). |

- **Total to strong production baseline:** ~5–8 months with the recommended team (Phase 0 + Phase 1 + Phase 2). Phase 3 is continuous.
- **Checklist:** Timeline and phases are specified; adjust for team size and scope changes.

---

## 3. Core Deliverables

- **Purpose:** List the key artifacts that “done” implies for the project.
- **Specification:**

| Deliverable | Description |
|-------------|-------------|
| **Product Requirements Document (PRD)** | Scope, outcomes, success metrics, and acceptance criteria (Part 1 and checklist). |
| **System architecture diagrams** | High-level architecture (control plane, execution plane, data stores, queues); deployment view (Coolify, services). |
| **Data model and API specs** | Prisma schema, GraphQL/Hasura design, REST and Actions (Parts 6, 7, 4.2). |
| **Security and compliance controls** | Auth, RBAC, secret encryption, webhook signing, logging policy, pen-test readiness (Part 11, Part 3). |
| **CI/CD and infrastructure code** | Lint, test, build, deploy pipelines; Dockerfiles; Compose; Coolify config (Part 9). |
| **Test suites and runbooks** | Unit, integration, E2E, load/chaos/security tests (Part 10); incident runbooks (Part 9). |
| **Operational dashboards and alerts** | Dashboards for API, queue, runner, DB; alerts for failures, saturation, latency (Part 9). |

- **Checklist:** Core deliverables are specified; track completion in project plan or checklist.

---

## 4. Summary: Checklist 14 Compliance

| Checklist item | Specification |
|----------------|----------------|
| Team composition | 1 PM, 1 Tech Lead, 2 Node, 2 Python/Platform, 1 Frontend, 1 DevOps/SRE, 1 QA, 1 Designer (part-time). |
| Timeline: Phase 0 (Foundation) | 3–5 weeks. |
| Timeline: Phase 1 (MVP) | 8–12 weeks. |
| Timeline: Phase 2 (Scale + hardening) | 8–12 weeks. |
| Timeline: Phase 3 (Ecosystem + enterprise) | Ongoing. |
| Total to production baseline | ~5–8 months. |
| Core deliverables | PRD, architecture diagrams, data model and API specs, security controls, CI/CD and infra, test suites and runbooks, dashboards and alerts. |

This completes **14) What It Takes to Build (People, Time, Deliverables)** checklist.
