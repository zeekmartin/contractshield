# ContractShield Sidecar Docker Image
# Multi-stage build for minimal image size

# ============================================================================
# Build stage
# ============================================================================
FROM node:20-alpine AS builder

WORKDIR /build

# Copy package files
COPY package*.json ./
COPY packages/pdp/package*.json ./packages/pdp/
COPY packages/sidecar/package*.json ./packages/sidecar/

# Install dependencies
RUN npm install --workspaces --include-workspace-root

# Copy source files
COPY packages/pdp/src ./packages/pdp/src
COPY packages/pdp/tsconfig.json ./packages/pdp/
COPY packages/sidecar/src ./packages/sidecar/src
COPY packages/sidecar/tsconfig.json ./packages/sidecar/

# Build
RUN npm run build --workspace=@contractshield/pdp
RUN npm run build --workspace=@contractshield/sidecar

# ============================================================================
# Production stage
# ============================================================================
FROM node:20-alpine AS production

# Add labels
LABEL org.opencontainers.image.title="ContractShield Sidecar"
LABEL org.opencontainers.image.description="Policy Decision Point sidecar for ContractShield"
LABEL org.opencontainers.image.version="0.3.0"
LABEL org.opencontainers.image.vendor="ContractShield"

# Create non-root user
RUN addgroup -g 1001 -S contractshield && \
    adduser -u 1001 -S contractshield -G contractshield

WORKDIR /app

# Copy built files
COPY --from=builder /build/packages/pdp/dist ./packages/pdp/dist
COPY --from=builder /build/packages/pdp/package.json ./packages/pdp/
COPY --from=builder /build/packages/sidecar/dist ./packages/sidecar/dist
COPY --from=builder /build/packages/sidecar/package.json ./packages/sidecar/

# Copy root package.json for workspaces
COPY package*.json ./

# Install production dependencies only
RUN npm install --workspaces --omit=dev --include-workspace-root

# Change ownership
RUN chown -R contractshield:contractshield /app

# Switch to non-root user
USER contractshield

# Environment variables
ENV NODE_ENV=production
ENV PORT=3100
ENV HOST=0.0.0.0
ENV LOG_LEVEL=info

# Expose port
EXPOSE 3100

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3100/health || exit 1

# Start sidecar
CMD ["node", "packages/sidecar/dist/cli.js"]
