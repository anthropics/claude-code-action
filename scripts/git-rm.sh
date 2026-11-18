#!/usr/bin/env bash
set -euo pipefail

# Wrapper around `git rm` that only takes basic flags and file paths.
#
# Usage:
#   git-rm.sh [-r] [-f] [--cached] [-q] [--] <paths>

source "$(dirname "${BASH_SOURCE[0]}")/git-env.sh"

paths_only=false
for arg in "$@"; do
  if [[ "$paths_only" == true ]]; then
    continue
  fi
  case "$arg" in
    -r | -f | -rf | -fr | --force | --cached | -q | --quiet) ;;
    --) paths_only=true ;;
    -*)
      echo "Error: only -r, -f, --cached, -q and file paths are allowed (got: $arg)" >&2
      exit 1
      ;;
  esac
done

exec git "${git_args[@]}" rm "$@"
