# Build stage - expects build context = repository root (Coolify)
FROM node:20-alpine AS builder

ENV NODE_ENV=development

WORKDIR /app

# Copy package files and prisma from api/
COPY api/package*.json ./
COPY api/prisma ./prisma

# Install dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY api/tsconfig.json ./
COPY api/src ./src/

# Build TypeScript
RUN ./node_modules/.bin/tsc

# Production stage
FROM node:20-alpine

WORKDIR /app

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

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run migrations and start server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
