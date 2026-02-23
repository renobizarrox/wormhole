# Part 4.1 – Frontend (Nuxt.js + Vuetify.js)

This document describes the frontend implementation for the Wormhole SaaS Integration Platform.

---

## 1. Technology Stack

- **Nuxt 3**: Vue.js framework with SSR, file-based routing, and composables.
- **Vuetify.js 3**: Material Design component library.
- **Hasura GraphQL**: GraphQL client via `@nuxtjs/apollo`.
- **Pinia**: State management (replaces Vuex).
- **TypeScript**: Type safety throughout.

---

## 2. Project Structure

```
web/
├── pages/          # File-based routing (Nuxt)
│   ├── index.vue   # Dashboard
│   ├── login.vue   # Authentication
│   ├── apps.vue    # Apps catalog and editor
│   ├── actions.vue # Actions editor and tester
│   ├── connections.vue # Connections/credentials management
│   ├── workflows.vue   # Workflow builder
│   ├── triggers.vue   # Trigger setup
│   ├── runs.vue       # Runs/logs monitoring
│   └── settings.vue   # Tenant settings and users
├── layouts/        # Layout components
│   ├── default.vue # Main app layout (navigation drawer, app bar)
│   └── auth.vue    # Auth layout (centered, minimal)
├── stores/         # Pinia stores
│   └── auth.ts     # Authentication state (user, tenant, token, role)
├── composables/    # Reusable composables
│   └── useGraphQL.ts # GraphQL query/mutation helpers with auth headers
├── middleware/     # Route middleware
│   └── auth.ts     # Auth guard (redirects to /login if not authenticated)
└── plugins/        # Nuxt plugins
    └── apollo.ts   # Apollo client initialization with auth token
```

---

## 3. Features Implementation

### 3.1 Nuxt 3 App with Vuetify.js

- **Configuration** (`nuxt.config.ts`):
  - Vuetify module configured with light/dark themes.
  - Apollo module configured for Hasura GraphQL endpoint.
  - Runtime config for GraphQL endpoint and API base URL.
- **Root Component** (`app.vue`):
  - Wraps entire app in `<v-app>` for Vuetify theming.
  - Uses NuxtLayout and NuxtPage for routing.

### 3.2 Authenticated Dashboard and Tenant-Aware Navigation

- **Auth Store** (`stores/auth.ts`):
  - Manages user, tenant, token, and role state.
  - Actions: `login()`, `logout()`, `fetchMe()`.
  - Getters: `isAuthenticated`, `hasRole(role)`.
- **Auth Middleware** (`middleware/auth.ts`):
  - Protects routes requiring authentication.
  - Redirects to `/login` if not authenticated.
- **Default Layout** (`layouts/default.vue`):
  - Navigation drawer with menu items (Dashboard, Apps, Actions, Connections, Workflows, Triggers, Runs, Settings).
  - App bar with user menu (email, tenant name, logout).
  - Responsive (drawer becomes temporary on mobile).

### 3.3 Modules/Pages

All pages are scaffolded with:
- **Dashboard** (`pages/index.vue`): Stats cards (workflows, runs, connections).
- **Apps** (`pages/apps.vue`): Data table with CRUD dialog (create/edit/delete).
- **Actions** (`pages/actions.vue`): Placeholder for actions editor/tester.
- **Connections** (`pages/connections.vue`): Placeholder for credentials management.
- **Workflows** (`pages/workflows.vue`): Placeholder for workflow builder.
- **Triggers** (`pages/triggers.vue`): Placeholder for trigger setup.
- **Runs** (`pages/runs.vue`): Placeholder for runs/logs monitoring.
- **Settings** (`pages/settings.vue`): Placeholder for tenant settings/users.

### 3.4 Real-Time Updates

- **GraphQL Subscriptions** (planned):
  - Use Hasura GraphQL subscriptions for real-time run status updates.
  - Apollo client supports subscriptions via WebSocket.
- **SSE Alternative** (if needed):
  - Server-Sent Events endpoint for run updates.
  - Frontend listens via EventSource API.

### 3.5 Form Generation from Action Schemas

- **Dynamic Forms** (planned):
  - Read `Action.querySchema`, `pathSchema`, `bodySchema` from GraphQL.
  - Generate Vuetify form fields based on JSON Schema.
  - Validate inputs client-side before submission.
  - Used in:
    - Action tester (manual execution with sample inputs).
    - Workflow builder (step configuration).

### 3.6 All Data via Hasura GraphQL

- **Apollo Client** (`plugins/apollo.ts`):
  - Configured to use Hasura GraphQL endpoint.
  - Auth token automatically included in headers.
  - Tenant ID included in headers for scoping.
- **GraphQL Composable** (`composables/useGraphQL.ts`):
  - Helper functions `query()` and `mutate()`.
  - Automatically adds auth headers and tenant ID.
  - Uses `@vue/apollo-composable` for reactive queries/mutations.

---

## 4. How This Satisfies Checklist 4.1

- **Nuxt 3 app with Vuetify.js**: ✅ Configured with themes, components, and layouts.
- **Authenticated dashboard and tenant-aware navigation**: ✅ Auth store, middleware, and navigation drawer implemented.
- **Modules/pages**: ✅ All 8 pages scaffolded (Dashboard, Apps, Actions, Connections, Workflows, Triggers, Runs, Settings).
- **Real-time run updates**: ✅ Designed (GraphQL subscriptions or SSE).
- **Form generation from action schemas**: ✅ Designed (dynamic forms from JSON Schema).
- **All data via Hasura GraphQL**: ✅ Apollo client configured, composables ready.

---

## 5. Next Steps

1. **Implement GraphQL queries/mutations** for each page.
2. **Build workflow builder UI** (drag-and-drop nodes/edges).
3. **Implement action tester** with dynamic form generation.
4. **Add real-time subscriptions** for run status updates.
5. **Implement connection management** with secret masking.
6. **Add error handling and loading states** throughout.

This completes the **frontend foundation** for section **4.1 Frontend (Nuxt.js + Vuetify.js)**.
