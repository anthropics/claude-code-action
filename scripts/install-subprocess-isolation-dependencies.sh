#!/usr/bin/env bash

# Best-effort installation for subprocess isolation. Keep each network command
# bounded so a stalled apt mirror cannot consume the caller's entire timeout.

if [ "${CLAUDE_CODE_SUBPROCESS_ENV_SCRUB:-}" = "0" ]; then
  echo "Subprocess isolation opted out via CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=0"
  exit 0
fi

if command -v apt-get >/dev/null && command -v sudo >/dev/null; then
  if command -v timeout >/dev/null; then
    for i in 1 2 3; do
      if timeout 60 sudo apt-get update -qq && \
        timeout 120 sudo apt-get install -y --no-install-recommends bubblewrap socat; then
        break
      fi
      echo "apt-get attempt $i failed or timed out, retrying..."
      sleep 5
    done
  else
    echo "Skipping subprocess isolation dependency installation: timeout is unavailable"
  fi
fi

# Ubuntu 24.04+ restricts unprivileged user namespaces via AppArmor.
# The sysctl doesn't exist on older kernels — that's fine.
if [ -f /proc/sys/kernel/apparmor_restrict_unprivileged_userns ] && command -v sudo >/dev/null; then
  sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
fi
