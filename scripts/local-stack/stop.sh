#!/usr/bin/env bash
STACK_DIR=${STACK_DIR:-/tmp/grandmaster-stack}
for f in "$STACK_DIR"/*.pid; do [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null; rm -f "$f"; done
echo "Local stack stopped."
