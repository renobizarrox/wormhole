# Wormhole Web Frontend

Nuxt 3 + Vuetify.js frontend for the Wormhole SaaS Integration Platform.

## Features

- **Nuxt 3** with TypeScript
- **Vuetify.js** for Material Design UI components
- **Hasura GraphQL** client integration via `@nuxtjs/apollo`
- **Pinia** for state management
- **Authentication** with JWT tokens
- **Tenant-aware** navigation and data scoping

## Setup

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start development server
npm run dev
```

## Project Structure

```
web/
├── pages/          # Route pages
│   ├── index.vue   # Dashboard
│   ├── login.vue   # Login page
│   ├── apps.vue    # Apps catalog/editor
│   ├── actions.vue # Actions editor/tester
│   ├── connections.vue # Connections management
│   ├── workflows.vue   # Workflow builder
│   ├── triggers.vue   # Trigger setup
│   ├── runs.vue      # Runs/logs monitoring
│   └── settings.vue   # Tenant settings/users
├── layouts/        # Layout components
│   ├── default.vue # Main app layout with navigation
│   └── auth.vue    # Auth layout (login/register)
├── stores/         # Pinia stores
│   └── auth.ts     # Authentication store
├── composables/    # Composable functions
│   └── useGraphQL.ts # GraphQL query/mutation helpers
├── middleware/     # Route middleware
│   └── auth.ts     # Auth guard middleware
└── plugins/        # Nuxt plugins
    └── apollo.ts   # Apollo client setup
```

## Environment Variables

- `GRAPHQL_ENDPOINT`: Hasura GraphQL endpoint (default: `http://localhost:8080/v1/graphql`)
- `HASURA_ADMIN_SECRET`: Hasura admin secret (dev only)
- `API_BASE_URL`: Custom API base URL for Actions (default: `http://localhost:3000`)

## GraphQL Integration

The frontend uses Hasura GraphQL for all data operations. Authentication tokens are automatically included in GraphQL requests via Apollo client headers.

## Development

- Run `npm run dev` for development server
- Run `npm run lint` to check code style
- Run `npm run format` to format code
