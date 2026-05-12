#!/bin/bash
echo "=== CLAUDE ARGUMENTS ===" > /tmp/claude-args.txt
for arg in "$@"; do
  echo "  \"$arg\"" >> /tmp/claude-args.txt
done
echo "=== END ===" >> /tmp/claude-args.txt
cat /tmp/claude-args.txt
exit 0
