# ── Forge API Server — Dockerfile ────────────────────────────────────────────
# Tier 2 (optional) — Docker / Podman container definition.
# Reuses PHASE-7-C container infrastructure (container_tools.js).
# No closure verification required for PHASE-12.
#
# Build:   docker build -t forge-api .
# Run:     docker compose up  (preferred — see compose.yml)
# Direct:  docker run -p 3100:3100 -v ./artifacts:/app/artifacts \
#                     -v ./progress:/app/progress -v ./logs:/app/logs \
#                     -e FORGE_API_PORT=3100 forge-api
#
# Note: create .dockerignore (see comment at bottom) before building to avoid
# copying artifacts/ into the image layer.
# ────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS base

# System dependencies (none required beyond Node base image)
WORKDIR /app

# Install dependencies first (cache layer — only re-runs when package.json changes)
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

# Copy source code (see .dockerignore to exclude artifacts/, progress/, logs/)
COPY code/ ./code/
COPY start-api.js ./
COPY bin/ ./bin/

# Runtime directories — created as mount points; volumes override these at runtime
# artifacts/ and progress/ MUST be mounted (stateful — not part of the image)
# logs/ can be a volume or a named volume
RUN mkdir -p artifacts progress logs

# Non-root user for container security
RUN addgroup -S forge && adduser -S forge -G forge
USER forge

# Forge API server port (matches FORGE_API_PORT default in start-api.js)
EXPOSE 3100

# Health check — polls the doctor endpoint once it exists (Stage 12.4+)
# For now, check that node can reach the port
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3100/api/system/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "start-api.js"]

# ── .dockerignore recommendation ─────────────────────────────────────────────
# Create scripts/service/.dockerignore (or repo-root .dockerignore) containing:
#
#   artifacts/
#   progress/
#   logs/
#   node_modules/
#   .env
#   *.env
#   scripts/
#   docs/
#   architecture/
#   web/
#   verify/
#
# This keeps the build context small and prevents sensitive data from being
# baked into the image layer.
