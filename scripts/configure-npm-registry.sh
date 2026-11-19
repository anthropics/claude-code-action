#!/usr/bin/env bash
# Point the action's own `bun install` at a custom npm registry (mirror, proxy,
# air-gapped network). Usage: configure-npm-registry.sh <dir>
# Reads NPM_REGISTRY and, optionally, NPM_AUTH_TOKEN. No-op when NPM_REGISTRY is empty.
set -euo pipefail

[ -n "${NPM_REGISTRY:-}" ] || exit 0

case "$NPM_REGISTRY" in
  http://* | https://*) ;;
  *) echo "npm_registry must start with http:// or https://" >&2; exit 1 ;;
esac

registry="${NPM_REGISTRY%/}/"
{
  echo "engine-strict=true"
  echo "registry=${registry}"
  if [ -n "${NPM_AUTH_TOKEN:-}" ]; then
    echo "//${registry#*://}:_authToken=${NPM_AUTH_TOKEN}"
  fi
} > "${1:?directory required}/.npmrc"
echo "Using npm registry ${registry}"
