#!/usr/bin/env bash
set -euo pipefail

# Wrapper around `git push` that only allows `origin <ref>` with no flags, and only
# updates the branch this session was set up on. That stops a prompt-injected session
# from updating main or anyone else's branch. Tag mode records the branch in a file
# beside this script. Elsewhere, set CLAUDE_PUSH_BRANCH.
# Defends against --receive-pack / --exec RCE and arbitrary-remote exfiltration
# (H1 #3556799). `git push:*` in allowedTools permits `git push --receive-pack='sh -c ...' ext::sh`
# which runs arbitrary shell on the Actions runner. This wrapper closes that.
#
# Usage:
#   git-push.sh origin HEAD
#   git-push.sh origin claude/issue-123-20260304

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

BRANCH="${CLAUDE_PUSH_BRANCH:-}"
source "$(dirname "${BASH_SOURCE[0]}")/git-env.sh"
if [[ -e "$script_dir/.push-branch" ]]; then
  BRANCH="$(<"$script_dir/.push-branch")"
fi
if [[ -z "$BRANCH" ]]; then
  echo "Error: CLAUDE_PUSH_BRANCH is not set, so there is no branch to push to" >&2
  exit 1
fi

case "$2" in
  HEAD) SOURCE="HEAD" ;;
  "$BRANCH") SOURCE="refs/heads/$BRANCH" ;;
  *)
    echo "Error: this session can only push to $BRANCH (got: $2)" >&2
    exit 1
    ;;
esac

# The full refspec fixes the target, whatever HEAD points at, and can't be forced.
exec git "${git_args[@]}" push origin "$SOURCE:refs/heads/$BRANCH"
