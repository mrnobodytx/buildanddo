#!/bin/sh
# ─── CGRF Header ──────────────────────────────
# File:        scripts/deploy/staging-readback.sh
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-CURRICULUM-PRIVATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-CURRICULUM-PRIVATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     docker-compose.staging.yml, apps/web/nginx.conf, apps/pocketbase/pb_hooks/lesson-keys.pb.js
# EnumType:    Service
# EnumEdges:   VALIDATES docker-compose.staging.yml; CONSUMES /api/health; CONSUMES /api/buildanddo/learning/keys-health; VERIFIED_BY apps/web/Dockerfile
# DAG Node:    buildanddo.staging.readback
# Intent:      Fail staging health unless the HTML shell, built JavaScript and PocketBase API are readable,
#              and, in full mode, every lesson can be graded from private lesson keys.
# ──────────────────────────────────────────────────────────

set -eu

base_url=${1:-http://127.0.0.1:3500}
mode=${2:-full}
base_url=${base_url%/}

case "$mode" in
    full|web-only) ;;
    *)
        echo "FAIL staging readback: mode must be full or web-only" >&2
        exit 2
        ;;
esac

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT HUP INT TERM

fetch() {
    url=$1
    destination=$2
    if command -v curl >/dev/null 2>&1; then
        curl --fail --silent --show-error --location --max-time 5 \
            --output "$destination" "$url"
    elif command -v wget >/dev/null 2>&1; then
        wget -q -T 5 -O "$destination" "$url"
    else
        echo "FAIL staging readback: curl or wget is required" >&2
        return 1
    fi
}

html_file="$work_dir/index.html"
if ! fetch "$base_url/" "$html_file"; then
    echo "FAIL staging readback: application root is unavailable" >&2
    exit 1
fi

if ! grep -q '<title>BuildAndDo' "$html_file" || ! grep -q 'id="root"' "$html_file"; then
    echo "FAIL staging readback: response is not the BuildAndDo application shell" >&2
    exit 1
fi

asset_path=$(sed -n 's|.*src="\(/assets/[^\"]*\.js\)".*|\1|p' "$html_file" | head -n 1)
if [ -z "$asset_path" ]; then
    echo "FAIL staging readback: application shell has no built JavaScript asset" >&2
    exit 1
fi

asset_file="$work_dir/application.js"
if ! fetch "$base_url$asset_path" "$asset_file" || [ ! -s "$asset_file" ]; then
    echo "FAIL staging readback: built JavaScript asset is unavailable" >&2
    exit 1
fi

if [ "$mode" = full ]; then
    api_file="$work_dir/api-health.json"
    if ! fetch "$base_url/api/health" "$api_file"; then
        echo "FAIL staging readback: PocketBase health endpoint is unavailable" >&2
        exit 1
    fi
    if ! grep -Eq '"code"[[:space:]]*:[[:space:]]*200' "$api_file"; then
        echo "FAIL staging readback: PocketBase did not report code 200" >&2
        exit 1
    fi

    # Guided grading needs the private lesson key file (SRS-BUILDANDDO-CURRICULUM-PRIVATE-001).
    # keys-health carries only the key state and lesson counts. The messages below are fixed text,
    # so nothing from the response reaches the log.
    keys_file="$work_dir/keys-health.json"
    if ! fetch "$base_url/api/buildanddo/learning/keys-health" "$keys_file"; then
        echo "FAIL staging readback: lesson keys health endpoint is unavailable" >&2
        exit 1
    fi
    keys_body=$(tr -d ' \t\r\n' < "$keys_file")
    case "$keys_body" in
        *'"keys":'*'"keys":'*|*'"unavailable":'*'"unavailable":'*)
            echo "FAIL staging readback: lesson keys health is ambiguous" >&2
            exit 1
            ;;
    esac
    case "$keys_body" in
        *'"keys":"PRIVATE"'*) ;;
        *)
            echo "FAIL staging readback: lesson grading keys are not installed as PRIVATE" >&2
            exit 1
            ;;
    esac
    case "$keys_body" in
        *'"unavailable":0,'*|*'"unavailable":0}'*) ;;
        *)
            echo "FAIL staging readback: some lessons cannot be graded" >&2
            exit 1
            ;;
    esac
fi

echo "PASS staging readback: application${mode:+ ($mode)} is serving at $base_url"
