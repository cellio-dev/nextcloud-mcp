#!/usr/bin/env bash
# Run on the Docker host (same machine as nextcloud-mcp). No jq required.
set -u

HOST="${MCP_HOST:-127.0.0.1}"
PORT="${MCP_HTTP_PORT:-${MCP_PORT:-3005}}"
TOKEN="${MCP_AUTH_TOKEN:-}"

BASE="http://${HOST}:${PORT}"

echo "=== 1) Raw health (no auth) ==="
curl -sS -w "\nHTTP %{http_code}\n" "${BASE}/health" || echo "(curl failed — is the container up on port ${PORT}?)"

echo ""
echo "=== 2) Docker (if you use compose here) ==="
if command -v docker >/dev/null 2>&1; then
  docker compose ps 2>/dev/null || docker ps --filter name=nextcloud-mcp
  echo "--- last logs ---"
  docker compose logs --tail=25 nextcloud-mcp 2>/dev/null || true
else
  echo "(docker not in PATH)"
fi

if [ -z "$TOKEN" ]; then
  echo ""
  echo "Set MCP_AUTH_TOKEN to run authenticated watch/poll (read from .env):"
  echo "  export MCP_AUTH_TOKEN=\$(grep '^MCP_AUTH_TOKEN=' .env | cut -d= -f2-)"
  exit 0
fi

echo ""
echo "=== 3) Watch status ==="
curl -sS -w "\nHTTP %{http_code}\n" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE}/watch/status" || true

echo ""
echo "=== 4) Force poll ==="
curl -sS -w "\nHTTP %{http_code}\n" \
  -X POST \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE}/watch/poll" || true