#!/usr/bin/env bash
# Fully-automated `pnpm dev:search`: brings up Meilisearch, then runs the
# web app and workers together — the combo needed to see the real
# `/dashboard/search` mobile screen (not the searchEnabled=false fallback)
# with a populated search index.
#
# What it does, in order:
#   1. Starts Docker Desktop if it isn't running yet (macOS `open -a Docker`)
#      and waits for the daemon to come up.
#   2. Runs `docker compose -f docker-compose.search.yml up -d` to start (or
#      reuse) the Meilisearch container.
#   3. Waits for Meilisearch's /health endpoint to answer.
#   4. Runs `pnpm web` and `pnpm workers` concurrently, killing both on
#      Ctrl+C / exit.
#
# It does NOT reindex existing bookmarks — that's a one-time, per-user admin
# action (Settings → Admin → Background Jobs → Reindex All Bookmarks), not
# something a dev-startup script should do on every run.
#
# Usage: pnpm dev:search  (or scripts/dev-search.sh directly)
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

MEILI_URL="http://127.0.0.1:7700"
COMPOSE_FILE="docker-compose.search.yml"

wait_for() {
  local description="$1"
  local check_cmd="$2"
  local timeout_s="$3"
  local waited=0
  until eval "$check_cmd" >/dev/null 2>&1; do
    if (( waited >= timeout_s )); then
      echo "Timed out after ${timeout_s}s waiting for ${description}." >&2
      exit 1
    fi
    sleep 2
    waited=$((waited + 2))
  done
}

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon not running — starting Docker Desktop..."
  if [[ "$(uname)" == "Darwin" ]] && command -v open >/dev/null 2>&1; then
    open -a Docker
  else
    echo "Please start Docker manually, then re-run this script." >&2
    exit 1
  fi
  wait_for "the Docker daemon" "docker info" 60
fi

# The compose file reads MEILI_MASTER_KEY from the *shell*, falling back to
# "devkey-change-me". The app reads it from apps/web/.env. Nothing connected
# those two, so the container came up on the default key while the app
# authenticated with the one in .env, and every search failed with
# "MeilisearchApiError: The provided API key is invalid." — surfacing in the UI
# as a search box that simply returned nothing, with the real cause only
# visible in the worker log. Export the app's value so the container is always
# started with the key the app is going to present.
if [[ -f apps/web/.env ]]; then
  key="$(grep -E '^MEILI_MASTER_KEY=' apps/web/.env | tail -1 | cut -d= -f2- | tr -d '"'"'"'')"
  if [[ -n "$key" ]]; then
    export MEILI_MASTER_KEY="$key"
  else
    echo "Note: MEILI_MASTER_KEY is not set in apps/web/.env; using the compose default." >&2
  fi
fi

echo "Starting Meilisearch (${COMPOSE_FILE})..."
# --force-recreate is not used: compose already recreates the container when
# the resolved environment changes, and recreating unconditionally would throw
# away a healthy container on every single start.
docker compose -f "$COMPOSE_FILE" up -d

echo "Waiting for Meilisearch at ${MEILI_URL}..."
wait_for "Meilisearch" "curl -sf ${MEILI_URL}/health" 30

echo "Meilisearch is up. Starting web + workers (Ctrl+C to stop both)..."

pids=()
cleanup() {
  echo "Stopping web + workers..."
  kill "${pids[@]}" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

pnpm web &
pids+=("$!")
pnpm workers &
pids+=("$!")

wait
