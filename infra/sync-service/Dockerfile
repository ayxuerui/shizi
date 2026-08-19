# Self-hosted sync service (task 9.2) — runs via tsx directly (no
# compile step), since it imports workspace packages whose package.json
# "main" fields point at TS source, same reason apps/assessment's own
# scripts need vite-node for cross-workspace TS imports. Build context is
# the REPO ROOT (see docker-compose.yml), not this directory, so npm
# workspaces resolve correctly.

# ---- deps stage: has a native-build toolchain for better-sqlite3 ----
FROM node:22-bookworm-slim AS deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY . .
RUN npm ci

# ---- runtime stage: no compiler toolchain, smaller image ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /repo
COPY --from=deps /repo /repo
WORKDIR /repo/infra/sync-service

ENV NODE_ENV=production
EXPOSE 8787
VOLUME ["/repo/infra/sync-service/data"]

CMD ["npx", "tsx", "src/server.ts"]
