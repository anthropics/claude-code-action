#!/usr/bin/env bash

# This installation is best-effort. Keep the whole operation below the action's
# typical five-minute timeout so a stalled apt mirror cannot prevent Claude
# from running without subprocess isolation.
set -uo pipefail

if [[ "${CLAUDE_CODE_SUBPROCESS_ENV_SCRUB:-}" == "0" ]]; then
  echo "Subprocess isolation opted out via CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=0"
  exit 0
fi

if ! command -v apt-get >/dev/null || ! command -v sudo >/dev/null; then
  exit 0
fi

if ! command -v timeout >/dev/null; then
  echo "timeout is unavailable; skipping best-effort subprocess isolation dependency installation"
  exit 0
fi

install_dependencies() {
  local attempt

  for attempt in 1 2 3; do
    if sudo apt-get update -qq \
      && sudo apt-get install -y --no-install-recommends bubblewrap socat; then
      return 0
    fi

    echo "apt-get attempt ${attempt} failed, retrying..."
    sleep 5
  done

  return 1
}
export -f install_dependencies

# timeout starts the command in its own process group. TERM reaches sudo and
# apt-get as well as the wrapper shell; KILL handles an unresponsive child.
if ! timeout --signal=TERM --kill-after=10s 180s bash -c install_dependencies; then
  echo "Subprocess isolation dependency installation failed or timed out; continuing without it"
fi

# Ubuntu 24.04+ restricts unprivileged user namespaces via AppArmor.
# The sysctl doesn't exist on older kernels — that's fine.
if [[ -f /proc/sys/kernel/apparmor_restrict_unprivileged_userns ]]; then
  sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
fi
