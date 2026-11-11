#!/usr/bin/env bash
set -euo pipefail

# Wrapper around `git commit` that only allows a literal message. Without it, an
# allow rule for `git commit` also permits flags that make git read a file into
# the commit, such as -F .git/config, which a later push would then publish.
#
# Usage:
#   git-commit.sh -m "<message>" [-m "<message>"] [-a] [--allow-empty] [-- <paths>]
#   git-commit.sh --amend --no-edit

has_message=false
amend=false
no_edit=false
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
    --amend)
      amend=true
      ;;
    --no-edit)
      no_edit=true
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

if [[ "$has_message" != true && ! ("$amend" == true && "$no_edit" == true) ]]; then
  echo "Error: a message is required, with -m or with --amend --no-edit" >&2
  exit 1
fi

exec git commit "$@"
