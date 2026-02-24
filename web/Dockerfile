# Build stage - expects build context = repository root (Coolify)
FROM node:20-alpine AS builder

ENV NODE_ENV=development

WORKDIR /app

# Copy package files from web/
COPY web/package*.json ./

# Install dependencies (npm install tolerates lock file drift; npm ci often fails with peer/optional deps)
RUN npm install

# Copy web app source (root .dockerignore excludes web/node_modules)
COPY web/ .

# Build Nuxt (SSR or static)
RUN npm run build

# Production stage (SSR)
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production dependencies only
COPY web/package*.json ./
RUN npm install --omit=dev

# Copy built application
COPY --from=builder /app/.output ./.output

# Expose port (Nuxt default is 3000)
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV NITRO_PORT=3000
ENV NITRO_HOST=0.0.0.0

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => {process.exit(r.statusCode < 500 ? 0 : 1)})"

# Start Nuxt server
CMD ["node", ".output/server/index.mjs"]
