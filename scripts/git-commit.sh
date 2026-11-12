#!/usr/bin/env bash
set -euo pipefail

# Wrapper around `git commit` that only allows a literal message. Without it, an
# allow rule for `git commit` also permits flags that make git read a file into
# the commit, such as -F .git/config, which a later push would then publish.
#
# Usage:
#   git-commit.sh -m "<message>" [-m "<message>"] [-a] [--allow-empty] [-- <paths>]

source "$(dirname "${BASH_SOURCE[0]}")/git-env.sh"

has_message=false
expect_message=false
paths_only=false

for arg in "$@"; do
  if [[ "$expect_message" == true ]]; then
    expect_message=false
    has_message=true
    continue
  fi
  if [[ "$paths_only" == true ]]; then
    continue
  fi
  case "$arg" in
    -m | --message | -am)
      expect_message=true
      ;;
    --message=*)
      has_message=true
      ;;
    -a | --all | --allow-empty | -q | --quiet | -s | --signoff)
      ;;
    --)
      paths_only=true
      ;;
    -*)
      echo "Error: only -m with a literal message and basic commit flags are allowed (got: $arg)" >&2
      exit 1
      ;;
  esac
done

if [[ "$expect_message" == true ]]; then
  echo "Error: -m needs a message" >&2
  exit 1
fi

if [[ "$has_message" != true ]]; then
  echo "Error: a message is required, with -m" >&2
  exit 1
fi

exec git "${git_args[@]}" commit "$@"
