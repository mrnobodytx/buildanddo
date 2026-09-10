#!/usr/bin/env bash
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/dev-setup.sh
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-DEVENV-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     docker-compose.yml, .env.example, scripts/dev-seed.mjs
# EnumType:    Workflow
# EnumEdges:   CONSUMES .env.example; TRIGGERS docker-compose.yml;
#              VERIFIED_BY http://localhost:8090/api/health
# Intent:      Take a fresh clone to a running, health-verified local stack in
#              one command, and fail loudly instead of half-starting.
# ───────────────────────────────────────────────────────────────
#
# Usage:
#   ./scripts/dev-setup.sh              start the stack and wait for health
#   ./scripts/dev-setup.sh --seed       ... then create demo workspace data
#   ./scripts/dev-setup.sh --rebuild    force an image rebuild first
#   ./scripts/dev-setup.sh --down       stop the stack (data volume kept)
#
# Windows contributors: use scripts/dev-setup.ps1, which does the same thing.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SEED=0
REBUILD=0
DOWN=0
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"

for arg in "$@"; do
	case "$arg" in
		--seed) SEED=1 ;;
		--rebuild) REBUILD=1 ;;
		--down) DOWN=1 ;;
		-h|--help)
			cat <<'USAGE'
Usage: ./scripts/dev-setup.sh [--seed] [--rebuild] [--down]

  --seed      create demo workspace data after the stack is healthy
  --rebuild   force an image rebuild before starting
  --down      stop the stack (the database volume is kept)

Environment: HEALTH_TIMEOUT (seconds to wait for PocketBase, default 120).
USAGE
			exit 0
			;;
		*)
			echo "unknown argument: $arg (try --help)" >&2
			exit 2
			;;
	esac
done

step()  { printf '\n==> %s\n' "$1"; }
ok()    { printf '    ok   %s\n' "$1"; }
warn()  { printf '    warn %s\n' "$1"; }
fail()  { printf '    FAIL %s\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------- prerequisites
step "Checking prerequisites"

command -v docker >/dev/null 2>&1 || fail "docker is not installed - https://docs.docker.com/get-docker/"
docker info >/dev/null 2>&1 || fail "the Docker daemon is not reachable - start Docker Desktop or the docker service"
ok "docker $(docker version --format '{{.Client.Version}}' 2>/dev/null || echo present)"

# Compose v2 is a docker subcommand; the standalone v1 binary is also accepted.
if docker compose version >/dev/null 2>&1; then
	COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
	COMPOSE=(docker-compose)
	warn "using legacy docker-compose; Compose v2 (docker compose) is recommended"
else
	fail "docker compose is not available - install Compose v2"
fi
ok "compose available"

# Node and npm are not required to run the stack (both live in containers), but
# every contributor needs them for lint, build and the boundary gate.
if command -v node >/dev/null 2>&1; then
	NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
	if [ "$NODE_MAJOR" -ge 20 ]; then
		ok "node $(node --version)"
	else
		warn "node $(node --version) is older than the toolchain needs (.nvmrc pins 22); containers are unaffected"
	fi
else
	warn "node is not installed on the host - the stack still runs, but 'npm run lint' and 'npm run build' will not"
fi

if command -v npm >/dev/null 2>&1; then
	ok "npm $(npm --version)"
else
	warn "npm is not installed on the host"
fi

# ------------------------------------------------------------------------- .env
step "Preparing .env"

if [ -f .env ]; then
	ok ".env already exists - left untouched"
else
	[ -f .env.example ] || fail ".env.example is missing from the repository root"
	cp .env.example .env
	ok "created .env from .env.example"
fi

# ------------------------------------------------------------------- stop early
if [ "$DOWN" -eq 1 ]; then
	step "Stopping the stack"
	"${COMPOSE[@]}" down
	ok "stopped (the pocketbase_data volume was kept; 'docker compose down -v' drops it)"
	exit 0
fi

# ------------------------------------------------------------------------- boot
if [ "$REBUILD" -eq 1 ]; then
	step "Rebuilding images"
	"${COMPOSE[@]}" build --pull
	ok "images rebuilt"
fi

step "Starting the stack"
"${COMPOSE[@]}" up -d
ok "containers requested"

# ----------------------------------------------------------------- health probe
# A real HTTP response from PocketBase, not "the container is running": the
# migration step runs first and can fail while the daemon stays up.
step "Waiting for PocketBase"

# Reads a KEY=VALUE line from .env, falling back to the compose default.
env_value() {
	local key="$1" fallback="$2" value=""
	if [ -f .env ]; then
		value="$(grep -E "^${key}=" .env | tail -1 | cut -d= -f2- || true)"
	fi
	printf '%s' "${value:-$fallback}"
}

PB_PORT="$(env_value POCKETBASE_PORT 8090)"
WEB_PORT="$(env_value WEB_PORT 3000)"

probe() {
	if command -v curl >/dev/null 2>&1; then
		curl -fsS -o /dev/null "$1"
	elif command -v wget >/dev/null 2>&1; then
		wget -q -O /dev/null "$1"
	else
		fail "neither curl nor wget is available to probe $1"
	fi
}

deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
until probe "http://localhost:${PB_PORT}/api/health" 2>/dev/null; do
	if [ "$(date +%s)" -ge "$deadline" ]; then
		printf '\n'
		"${COMPOSE[@]}" ps || true
		echo "--- last 40 lines: pocketbase-migrate ---" >&2
		"${COMPOSE[@]}" logs --tail 40 pocketbase-migrate >&2 || true
		echo "--- last 40 lines: pocketbase ---" >&2
		"${COMPOSE[@]}" logs --tail 40 pocketbase >&2 || true
		fail "PocketBase did not answer /api/health within ${HEALTH_TIMEOUT}s"
	fi
	printf '.'
	sleep 2
done
printf '\n'
ok "PocketBase is healthy on port ${PB_PORT}"

# The Vite dev server takes a few seconds to pre-bundle on first start. Not
# reaching it is a warning, not a failure - the backend is what gates seeding.
deadline=$(( $(date +%s) + 60 ))
until probe "http://localhost:${WEB_PORT}/" 2>/dev/null; do
	if [ "$(date +%s)" -ge "$deadline" ]; then
		warn "the web dev server has not answered yet - check 'docker compose logs -f web'"
		break
	fi
	sleep 2
done
if probe "http://localhost:${WEB_PORT}/" 2>/dev/null; then
	ok "web dev server is answering on port ${WEB_PORT}"
fi

# ------------------------------------------------------------------------- seed
if [ "$SEED" -eq 1 ]; then
	step "Seeding demo data"
	if command -v node >/dev/null 2>&1; then
		PB_URL="http://localhost:${PB_PORT}" node scripts/dev-seed.mjs
	else
		# No host Node: run the seeder inside the web container, which has one.
		# The container has no .env (it is excluded from the build context), so
		# the credentials are passed explicitly rather than defaulted.
		"${COMPOSE[@]}" exec -T \
			-e PB_URL="http://pocketbase:8090" \
			-e PB_SUPERUSER_EMAIL="$(env_value PB_SUPERUSER_EMAIL admin@buildanddo.local)" \
			-e PB_SUPERUSER_PASSWORD="$(env_value PB_SUPERUSER_PASSWORD localdev-change-me)" \
			-e DEMO_USER_EMAIL="$(env_value DEMO_USER_EMAIL demo@buildanddo.local)" \
			-e DEMO_USER_PASSWORD="$(env_value DEMO_USER_PASSWORD demo-localdev-1234)" \
			web node /workspace/scripts/dev-seed.mjs \
			|| fail "seeding failed - run it on the host with: node scripts/dev-seed.mjs"
	fi
fi

# ------------------------------------------------------------------------ report
cat <<EOF

BuildAndDo local stack is up.

  Web app            http://localhost:${WEB_PORT}
  PocketBase API     http://localhost:${PB_PORT}
  PocketBase admin   http://localhost:${PB_PORT}/_/
  API reference      docs/api/README.md

Admin credentials come from .env (PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD);
they are local development values and must never match a deployed environment.

  docker compose logs -f web          follow the frontend
  docker compose logs -f pocketbase   follow the backend
  docker compose down                 stop, keeping the database
  docker compose down -v              stop and delete the database volume
EOF
