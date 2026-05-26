#!/usr/bin/env bash
# Spin up four local Anvil instances that mirror the chainIds in
# backend/lib/environments.mjs:
#   9000 origin (IntentEscrow + SettlementRegistry + MockERC20)
#   9101 fast-rollup destination (DestinationVault + MockERC20)
#   9102 cheap-rollup destination
#   9103 congested-rollup destination
#
# Logs and pidfiles go under data/anvil/.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/data/anvil"
mkdir -p "$RUN_DIR"

declare -a CHAINS=(
  "origin:9000:8545"
  "fast-rollup:9101:8546"
  "cheap-rollup:9102:8547"
  "congested-rollup:9103:8548"
)

if ! command -v anvil >/dev/null 2>&1; then
  echo "anvil not found in PATH. Install Foundry first." >&2
  exit 1
fi

# Block size and block time are kept small so the simulator gets fast feedback.
for entry in "${CHAINS[@]}"; do
  IFS=":" read -r name chain_id port <<< "$entry"
  pidfile="$RUN_DIR/$name.pid"
  logfile="$RUN_DIR/$name.log"

  if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "[$name] already running (pid $(cat "$pidfile"))"
    continue
  fi

  echo "[$name] starting on port $port (chainId $chain_id)"
  nohup anvil \
    --chain-id "$chain_id" \
    --port "$port" \
    --host 127.0.0.1 \
    --block-time 1 \
    --silent \
    > "$logfile" 2>&1 &
  echo $! > "$pidfile"
done

echo "All chains launched. Logs in $RUN_DIR/."
echo "Next: npm run chains:deploy"
