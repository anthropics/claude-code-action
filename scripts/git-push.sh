#!/usr/bin/env bash
set -euo pipefail

# Wrapper around `git push` that only allows:
#   git push origin <ref>
#
# Security protections:
# - Blocks arbitrary remotes
# - Blocks git flag injection
# - Blocks --receive-pack abuse
# - Blocks ext:: transport RCE
# - Validates branch/ref names

if [[ $# -ne 2 ]]; then
  echo "Error: exactly two arguments required: origin <ref>" >&2
  exit 1
fi

for arg in "$@"; do
  if [[ "$arg" == -* ]]; then
    echo "Error: flags are not allowed (got: $arg)" >&2
    exit 1
  fi
done

if [[ "$1" != "origin" ]]; then
  echo "Error: remote must be 'origin' (got: $1)" >&2
  exit 1
fi

REF="$2"

if [[ "$REF" != "HEAD" ]] && \
   ! git check-ref-format --branch "$REF" >/dev/null 2>&1; then
  echo "Error: invalid ref: $REF" >&2
  exit 1
fi

# Extra hardening against protocol abuse
git config --global --unset-all protocol.ext.allow || true

exec git \
  -c protocol.ext.allow=never \
  push origin "$REF"
