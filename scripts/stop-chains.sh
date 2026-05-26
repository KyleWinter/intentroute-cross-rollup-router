#!/usr/bin/env bash
# Stop the four anvil instances launched by start-chains.sh.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/data/anvil"

if [[ ! -d "$RUN_DIR" ]]; then
  echo "No anvil run directory at $RUN_DIR. Nothing to stop."
  exit 0
fi

shopt -s nullglob
for pidfile in "$RUN_DIR"/*.pid; do
  name="$(basename "$pidfile" .pid)"
  pid="$(cat "$pidfile")"
  if kill -0 "$pid" 2>/dev/null; then
    echo "[$name] stopping (pid $pid)"
    kill "$pid"
  else
    echo "[$name] not running"
  fi
  rm -f "$pidfile"
done
