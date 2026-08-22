# The production gateway image (harden-prod-deployment) — replaces the old
# bind-mount of a host-built apps/assessment/dist. Production now serves an
# artifact instead of reading a filesystem path anything else can modify or
# delete; see openspec/changes/harden-prod-deployment/design.md.
#
# Deliberately mirrors infra/sync-service/Dockerfile's shape (a deps stage
# with the native-build toolchain, then a slim runtime stage) even though
# this image never touches better-sqlite3 — build context is the REPO ROOT
# (see docker-compose.yml) so npm workspaces resolve correctly, and a single
# `npm ci` at the root always needs that toolchain to install the sibling
# infra/sync-service workspace's dependency, regardless of which app is
# actually being built. One build recipe for the whole monorepo rather than
# two, per design.md's "one mental model for both images" decision.

# ---- deps stage: has a native-build toolchain (unused by this app itself,
#      but required for the sibling sync-service workspace's better-sqlite3
#      to install via the same root-level npm ci) ----
FROM node:22-bookworm-slim AS deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY . .
RUN npm ci

# ---- build stage: compile every workspace package (tsc -b), then the app
#      itself. VITE_SYNC_ENDPOINT/VITE_SYNC_TOKEN arrive as build args, not
#      a mounted secret — the matching client-side token is already public
#      in the served bundle by this project's own shared-token design (see
#      bootstrap-shizi-assessment's design.md), so there is nothing here a
#      secret mount would actually protect. Vite inlines VITE_-prefixed
#      process.env vars into the build the same way it would an .env file
#      (see vite.config.ts's loadEnv call) — no .env file is written here. ----
FROM deps AS build
ARG VITE_SYNC_ENDPOINT
ARG VITE_SYNC_TOKEN
ENV VITE_SYNC_ENDPOINT=${VITE_SYNC_ENDPOINT}
ENV VITE_SYNC_TOKEN=${VITE_SYNC_TOKEN}
RUN npx tsc -b && npm run build --workspace=apps/assessment

# ---- runtime stage: nginx serving the built app. The nginx template is
#      the SAME file docker-compose.dev.yml bind-mounts (add-dev-deployment's
#      "one shared source of truth" decision) — baking it in here doesn't
#      change that; both environments still render the identical template,
#      just from different sources (image vs. working tree), and
#      SYNC_UPSTREAM/NGINX_ENVSUBST_FILTER are still supplied at container
#      start by docker-compose.yml exactly as before. config.json is
#      deliberately NOT copied here — see docker-compose.yml's gateway
#      service comment for why it's a host mount instead. ----
FROM nginx:1.27-alpine AS runtime
COPY --from=build /repo/apps/assessment/dist /usr/share/nginx/html
COPY infra/nginx-assessment.conf.template /etc/nginx/templates/default.conf.template
