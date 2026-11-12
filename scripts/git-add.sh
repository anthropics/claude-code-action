#!/usr/bin/env bash
set -euo pipefail

# Wrapper around `git add` that only stages files. Without it, an allow rule for
# `git add` also permits flags that open an editor or read a file of paths.
#
# Usage:
#   git-add.sh [-A] [-u] [-v] [--] <paths>

source "$(dirname "${BASH_SOURCE[0]}")/git-env.sh"

paths_only=false
for arg in "$@"; do
  if [[ "$paths_only" == true ]]; then
    continue
  fi
  case "$arg" in
    -A | --all | -u | --update | -v | --verbose) ;;
    --) paths_only=true ;;
    -*)
      echo "Error: only -A, -u, -v and file paths are allowed (got: $arg)" >&2
      exit 1
      ;;
  esac
done

exec git "${git_args[@]}" add "$@"
