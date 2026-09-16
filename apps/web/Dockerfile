# ─── CGRF Header ──────────────────────────────
# File:        apps/web/Dockerfile
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     package-lock.json, apps/web/nginx.conf, scripts/deploy/staging-readback.sh
# EnumType:    ConfigDoc
# EnumEdges:   CONSUMES package-lock.json; PRODUCES http://localhost:3500; VERIFIED_BY scripts/deploy/staging-readback.sh
# DAG Node:    buildanddo.staging.web
# Intent:      Build the pinned web workspace under Node 22 and serve only its static production output.
# ────────────────────────────────────────────────────────────

FROM node:22-alpine AS build

WORKDIR /workspace

# Install from the workspace lock before copying source so source-only changes
# retain the dependency layer. Every workspace manifest is required by npm ci.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/pocketbase/package.json apps/pocketbase/package.json
RUN npm ci --no-audit --no-fund

COPY . .

# .git is excluded from the image context. Requiring the full candidate SHA
# prevents a container build from silently receiving an invented release ID.
ARG BUILD_SHA
RUN case "${BUILD_SHA}" in \
      *[!0-9a-fA-F]*) echo "BUILD_SHA must contain only hexadecimal characters" >&2; exit 1 ;; \
    esac \
    && test "${#BUILD_SHA}" -eq 40 \
    || { echo "BUILD_SHA must be exactly 40 hexadecimal characters" >&2; exit 1; }

ARG VITE_POCKETBASE_API_URL=/
ARG VITE_DD_APPLICATION_ID=
ARG VITE_DD_CLIENT_TOKEN=
ARG VITE_DD_ENV=staging
ARG VITE_DD_SESSION_SAMPLE_RATE=
ARG VITE_DD_REPLAY_SAMPLE_RATE=
ARG VITE_DD_TRACE_SAMPLE_RATE=
ARG VITE_BUILDANDDO_PH=

ENV BUILD_SHA=${BUILD_SHA} \
    VITE_POCKETBASE_API_URL=${VITE_POCKETBASE_API_URL} \
    VITE_DD_APPLICATION_ID=${VITE_DD_APPLICATION_ID} \
    VITE_DD_CLIENT_TOKEN=${VITE_DD_CLIENT_TOKEN} \
    VITE_DD_ENV=${VITE_DD_ENV} \
    VITE_DD_SESSION_SAMPLE_RATE=${VITE_DD_SESSION_SAMPLE_RATE} \
    VITE_DD_REPLAY_SAMPLE_RATE=${VITE_DD_REPLAY_SAMPLE_RATE} \
    VITE_DD_TRACE_SAMPLE_RATE=${VITE_DD_TRACE_SAMPLE_RATE} \
    VITE_BUILDANDDO_PH=${VITE_BUILDANDDO_PH}

RUN npm run build --prefix apps/web \
    && test -s dist/apps/web/index.html

FROM nginx:1.27-alpine AS runtime

COPY apps/web/nginx.conf /etc/nginx/nginx.conf
COPY scripts/deploy/staging-readback.sh /usr/local/bin/staging-readback.sh
COPY --from=build /workspace/dist/apps/web/ /usr/share/nginx/html/

RUN chmod 0555 /usr/local/bin/staging-readback.sh \
    && find /usr/share/nginx/html -type d -exec chmod 0555 {} + \
    && find /usr/share/nginx/html -type f -exec chmod 0444 {} +

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=4 \
    CMD ["/usr/local/bin/staging-readback.sh", "http://127.0.0.1", "web-only"]

CMD ["nginx", "-g", "daemon off;"]
