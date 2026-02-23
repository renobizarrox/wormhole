# Build stage - expects build context = repository root (Coolify)
FROM node:20-alpine AS builder

# Force devDependencies so TypeScript is installed (Coolify may set NODE_ENV=production at build)
ENV NODE_ENV=development

WORKDIR /app

# Copy package files and prisma from api/
COPY api/package*.json ./
COPY api/prisma ./prisma

# Install all dependencies including dev (typescript, etc.)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy only source and config (do not COPY api/ . to avoid overwriting node_modules)
COPY api/tsconfig.json ./
COPY api/src ./src/

# Build TypeScript using local node_modules (avoids npx installing wrong "tsc" package)
RUN ./node_modules/.bin/tsc

# Production stage (Debian base: Prisma engine needs glibc/OpenSSL; Alpine often fails)
FROM node:20-slim

WORKDIR /app

# curl for Coolify healthcheck; ca-certificates for HTTPS
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy package files and install production dependencies only
COPY api/package*.json ./
COPY api/prisma ./prisma

RUN npm ci --only=production

# Copy Prisma client and generated files from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy built application
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3000

# Health check (curl used by Coolify; node fallback in Docker)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f -s http://localhost:3000/health || exit 1

# Run migrations and start server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
