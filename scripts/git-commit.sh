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
has_path=false
all=false
args=()

for arg in "$@"; do
  # The arguments without -a, for when the files it adds are staged separately below.
  kept="$arg"
  if [[ "$expect_message" == true ]]; then
    expect_message=false
    has_message=true
  elif [[ "$paths_only" == true ]]; then
    has_path=true
  else
    case "$arg" in
      -m | --message)
        expect_message=true
        ;;
      -am)
        expect_message=true
        all=true
        kept="-m"
        ;;
      --message=*)
        has_message=true
        ;;
      -a | --all)
        all=true
        continue
        ;;
      --allow-empty | -q | --quiet | -s | --signoff) ;;
      --)
        paths_only=true
        ;;
      -*)
        echo "Error: only -m with a literal message and basic commit flags are allowed (got: $arg)" >&2
        exit 1
        ;;
      *)
        has_path=true
        ;;
    esac
  fi
  args+=("$kept")
done

if [[ "$expect_message" == true ]]; then
  echo "Error: -m needs a message" >&2
  exit 1
fi

if [[ "$has_message" != true ]]; then
  echo "Error: a message is required, with -m" >&2
  exit 1
fi

# The action took these files from a branch other than the pull request's base, so a
# commit must not carry that branch's version of them. It stays in the working tree.
restored=()
if [[ -e "$script_dir/.restored-paths" ]]; then
  while IFS= read -r pathspec; do
    restored+=("$pathspec")
  done <"$script_dir/.restored-paths"
fi
if [[ ${#restored[@]} -gt 0 ]]; then
  if [[ "$has_path" == true ]]; then
    for pathspec in "${restored[@]}"; do
      args+=(":(exclude,${pathspec#:(}")
    done
  elif [[ "$all" == true ]]; then
    git "${git_args[@]}" add -u :/
  fi
  if ! git "${git_args[@]}" diff --cached --quiet -- "${restored[@]}"; then
    git "${git_args[@]}" reset -q -- "${restored[@]}"
    echo "Note: these files come from another branch in this run, so their changes are not committed: ${restored[*]}" >&2
  fi
  if [[ "$has_path" != true || "$all" != true ]]; then
    set -- "${args[@]}"
  fi
fi

exec git "${git_args[@]}" commit "$@"
