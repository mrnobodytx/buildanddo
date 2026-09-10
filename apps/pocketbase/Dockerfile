# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/pocketbase/Dockerfile
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-DEVENV-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     apps/pocketbase/pb_migrations, apps/pocketbase/pb_hooks
# EnumType:    ConfigDoc
# EnumEdges:   CONSUMES apps/pocketbase/pb_hooks; CONSUMES apps/pocketbase/pb_migrations;
#              PRODUCES http://localhost:8090
# Intent:      Package the PocketBase server with this repo's hooks and migrations
#              so a contributor gets the real backend, not a stand-in.
# ───────────────────────────────────────────────────────────────
#
# Local development image. Production runs PocketBase on the VPS from the
# private mirror's pipeline; nothing here participates in a deploy.
#
# PocketBase hooks are JavaScript executed by the server's embedded JSVM
# (pb_hooks/*.pb.js) - there is no compile step. They are copied in, and
# docker-compose.yml re-mounts them read-only so an edit takes effect on
# restart without a rebuild.

ARG POCKETBASE_VERSION=0.28.4

FROM alpine:3.20 AS fetch
ARG POCKETBASE_VERSION
ARG TARGETARCH
RUN apk add --no-cache ca-certificates unzip wget \
    && case "${TARGETARCH:-amd64}" in \
         amd64) PB_ARCH=amd64 ;; \
         arm64) PB_ARCH=arm64 ;; \
         arm) PB_ARCH=armv7 ;; \
         *) echo "unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
       esac \
    && wget -q -O /tmp/pocketbase.zip \
       "https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}/pocketbase_${POCKETBASE_VERSION}_linux_${PB_ARCH}.zip" \
    && unzip -q /tmp/pocketbase.zip -d /tmp/pb \
    && chmod +x /tmp/pb/pocketbase

FROM alpine:3.20
# ca-certificates: pb_hooks make outbound HTTPS calls when their integration
# variables are set. wget: the compose healthcheck probes /api/health.
RUN apk add --no-cache ca-certificates wget tzdata

WORKDIR /pb
COPY --from=fetch /tmp/pb/pocketbase /pb/pocketbase
COPY pb_migrations /pb/pb_migrations
COPY pb_hooks /pb/pb_hooks
RUN mkdir -p /pb/pb_data

EXPOSE 8090

# Overridden by docker-compose.yml; this default keeps `docker run` usable.
ENTRYPOINT ["/pb/pocketbase"]
CMD ["serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--migrationsDir=/pb/pb_migrations", "--hooksDir=/pb/pb_hooks", "--hooksWatch=false"]
