# Part 2.2 – Apps (Connector Definitions)

This document specifies how **Apps** (connectors) are represented in the data model and how they satisfy the checklist items in section **2.2 Apps (Connector Definitions)**.

---

## 1. Overview

An **App** represents a connector to an external platform (e.g. NetSuite, Shopify, SAP).  
Each App:

- Belongs to exactly one **Tenant** (tenant-scoped connector definitions).
- Has one or more **AppVersions** that capture:
  - Auth type for that connector.
  - App-level settings schema (e.g. account-level configuration).
  - Lifecycle status via `App.status` (draft/published/deprecated).

Actions for a given App will be attached to a specific `AppVersion` (defined later in section 2.3).

---

## 2. Prisma data model

Defined in `api/prisma/schema.prisma`:

```prisma
enum AppStatus {
  Draft
  Published
  Deprecated
}

enum AuthType {
  API_KEY
  OAUTH2
  BASIC
  CUSTOM_HEADER
}

model App {
  id          String     @id @default(uuid())
  tenantId    String     @map("tenant_id")
  key         String
  name        String
  vendor      String?
  category    String?
  description String?
  iconUrl     String?    @map("icon_url")
  status      AppStatus  @default(Draft)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  tenant   Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  versions AppVersion[]

  @@unique([tenantId, key])
  @@index([tenantId])
  @@map("apps")
}

model AppVersion {
  id             String    @id @default(uuid())
  appId          String    @map("app_id")
  version        Int
  authType       AuthType  @map("auth_type")
  settingsSchema Json?     @map("settings_schema")
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  publishedAt    DateTime?

  app App @relation(fields: [appId], references: [id], onDelete: Cascade)

  @@unique([appId, version])
  @@index([appId])
  @@map("app_versions")
}
```

### 2.1 App metadata

Checklist item: **“App metadata: name, slug, vendor, category, description, icon, status.”**

- `App.name`: Human-readable name (e.g. \"NetSuite\", \"Shopify\").
- `App.key`: Machine-friendly slug per tenant (e.g. `netsuite`, `shopify`); enforced unique per tenant via `@@unique([tenantId, key])`.
- `App.vendor`: Vendor name (e.g. \"Oracle\", \"Shopify Inc.\").
- `App.category`: Arbitrary category (e.g. `erp`, `ecommerce`, `field_service`).
- `App.description`: Free-text description for UI/catalog.
- `App.iconUrl`: Optional URL to app icon.
- `App.status`: Enum `AppStatus` = `Draft`, `Published`, `Deprecated`.

### 2.2 Versioning

Checklist item: **“App versioning (draft/published/deprecated).”**

- `AppStatus` controls the *overall lifecycle* of the App (draft, published, deprecated).
- `AppVersion` stores:
  - `version` (integer, unique per App).
  - `publishedAt` (timestamp when that version was published).
- There can be multiple `AppVersion` rows per App; the latest published version is used for new workflows, while older versions remain for backward compatibility.

### 2.3 Authentication types per App

Checklist item: **“Authentication types per app: API Key, OAuth2, Basic, Custom headers/token.”**

- Enum `AuthType`:
  - `API_KEY`
  - `OAUTH2`
  - `BASIC`
  - `CUSTOM_HEADER`
- Each `AppVersion.authType` indicates which auth mechanism this version expects.
- Concrete credential instances (Connections) will reference both:
  - The target App (and optionally AppVersion).
  - The stored secret(s) appropriate for that `AuthType`.

### 2.4 App-level settings schema

Checklist item: **“App-level settings schema.”**

- `AppVersion.settingsSchema` is a JSON field that will hold a JSON Schema-style definition of configuration fields required at the App level (e.g. account id, region, sandbox/production flags).
- Frontend uses this schema to render dynamic forms for app configuration.

---

## 3. How this satisfies checklist 2.2

- **CRUD for App**: Implemented at the data level via `App` model.  
  GraphQL CRUD operations will be defined using this model in section 7 (API Surface).
- **App metadata**: `App` fields (`key`, `name`, `vendor`, `category`, `description`, `iconUrl`, `status`) cover all required metadata fields.
- **App versioning**: `AppStatus` + `AppVersion` with `version` and `publishedAt` enable multi-version management and lifecycle.
- **Authentication types per app**: `AuthType` enum + `AppVersion.authType` model the supported auth types per App version.
- **App-level settings schema**: `AppVersion.settingsSchema` provides a JSON schema for per-app configuration.

This completes the **data model and specification** for section **2.2 Apps (Connector Definitions)**. GraphQL schema and resolvers for App/AppVersion will be added when implementing the API surface (section 7).

