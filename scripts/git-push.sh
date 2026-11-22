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
marker="$script_dir/.record-failed-push"
if [[ ! -f "$marker" ]]; then
  exec git "${git_args[@]}" push origin "$SOURCE:refs/heads/$BRANCH"
fi

# Discard an earlier receipt when a new authorized push starts.
receipt="$script_dir/.failed-push"
rm -f -- "$receipt"

# Replay uses the action's own Git settings. Leave custom push destinations and
# pre-push hook policies to the original invocation.
push_url=$(git "${git_args[@]}" remote get-url --push --all origin) || push_url=""
pre_push_hook=$(git "${git_args[@]}" rev-parse --git-path hooks/pre-push) || pre_push_hook=""
if [[ -z "$push_url" || "$push_url" != "$(<"$marker")" || -z "$pre_push_hook" || -e "$pre_push_hook" || -L "$pre_push_hook" ]]; then
  exec git "${git_args[@]}" push origin "$SOURCE:refs/heads/$BRANCH"
fi

# Keep the exact attempted commit. A later HEAD or working-tree change was
# never part of this push.
commit=$(git "${git_args[@]}" rev-parse --verify "$SOURCE^{commit}")
stderr_file=$(mktemp)
trap 'rm -f -- "$stderr_file"' EXIT
status=0
LC_ALL=C git "${git_args[@]}" push origin "$commit:refs/heads/$BRANCH" 2>"$stderr_file" || status=$?
cat -- "$stderr_file" >&2 || true

if [[ "$status" -ne 0 ]] && grep -Eq '^fatal: Authentication failed for |^fatal: unable to access .+: The requested URL returned error: 401$' "$stderr_file"; then
  (umask 077; set -C; printf '%s\n' "$commit" >"$receipt") || true
fi
exit "$status"
