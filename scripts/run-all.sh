#!/usr/bin/env bash
# One-click launcher for IntentRoute.
#
#   ./scripts/run-all.sh              # full on-chain mode (chains + deploy + backend)
#   ./scripts/run-all.sh --simulated  # in-memory mode only (no chains, no Foundry)
#   ./scripts/run-all.sh --stop       # tear everything down (backend + anvils)
#   ./scripts/run-all.sh --doctor     # print dependency status and exit
#   ./scripts/run-all.sh --install-solc  # download solc 0.7.4 to data/solc/
#
# Idempotent: re-running is safe. The script checks what is already up and
# only does the missing work. Deployment is re-run only when contracts are
# missing from the chains, so the deterministic addresses in
# data/deployments.json stay stable.
#
# Fresh-device requirements:
#   - Node.js >= 18  (https://nodejs.org)
#   - Foundry        (curl -L https://foundry.paradigm.xyz | bash && foundryup)
#   - solc 0.7.4     (this script can fetch it: ./scripts/run-all.sh --install-solc)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/data/anvil"
SOLC_LOCAL_DIR="$ROOT_DIR/data/solc"
BACKEND_PORT="${PORT:-3100}"

MODE="onchain"
case "${1:-}" in
  --simulated)    MODE="simulated" ;;
  --stop)         MODE="stop" ;;
  --doctor)       MODE="doctor" ;;
  --install-solc) MODE="install-solc" ;;
  -h|--help)
    sed -n '2,22p' "$0"
    exit 0
    ;;
  "") ;;
  *)
    echo "unknown flag: $1" >&2
    sed -n '2,22p' "$0"
    exit 1
    ;;
esac

# ---------- helpers ----------

log() {
  printf '\033[1;36m[run-all]\033[0m %s\n' "$*"
}

warn() {
  printf '\033[1;33m[run-all]\033[0m %s\n' "$*" >&2
}

die() {
  printf '\033[1;31m[run-all]\033[0m %s\n' "$*" >&2
  exit 1
}

resolve_solc() {
  if [[ -n "${LOCAL_SOLC_PATH:-}" && -x "$LOCAL_SOLC_PATH" ]]; then
    echo "$LOCAL_SOLC_PATH"
    return
  fi
  for candidate in \
    "$SOLC_LOCAL_DIR/solc-0.7.4" \
    "$HOME/.solc-select/artifacts/solc-0.7.4/solc-0.7.4" \
    "$HOME/Library/Caches/hardhat-nodejs/compilers-v2/macosx-amd64/solc-macosx-amd64-v0.7.4+commit.3f05b770" \
    "$HOME/Library/Caches/hardhat-nodejs/compilers-v2/linux-amd64/solc-linux-amd64-v0.7.4+commit.3f05b770"; do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return
    fi
  done
  return 1
}

# Download the official solc 0.7.4 binary from binaries.soliditylang.org and
# park it under data/solc/. Works on macOS (any arch via Rosetta if needed)
# and Linux x86_64. Returns the resolved path on stdout.
install_solc() {
  mkdir -p "$SOLC_LOCAL_DIR"
  local target="$SOLC_LOCAL_DIR/solc-0.7.4"

  if [[ -x "$target" ]]; then
    log "solc 0.7.4 already at $target"
    echo "$target"
    return
  fi

  local os
  os=$(uname -s)
  local platform=""
  local url=""
  case "$os" in
    Darwin)
      platform="macosx-amd64"
      url="https://binaries.soliditylang.org/macosx-amd64/solc-macosx-amd64-v0.7.4+commit.3f05b770"
      ;;
    Linux)
      platform="linux-amd64"
      url="https://binaries.soliditylang.org/linux-amd64/solc-linux-amd64-v0.7.4+commit.3f05b770"
      ;;
    *)
      die "unsupported OS for solc auto-install: $os. Install solc 0.7.4 manually and set LOCAL_SOLC_PATH."
      ;;
  esac

  log "downloading solc 0.7.4 ($platform) → $target"
  if command -v curl >/dev/null 2>&1; then
    curl -fL -o "$target" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$target" "$url"
  else
    die "neither curl nor wget is available; cannot download solc"
  fi
  chmod +x "$target"

  # Smoke test the binary before claiming success.
  if ! "$target" --version >/dev/null 2>&1; then
    rm -f "$target"
    die "downloaded solc binary failed to run. If on Apple Silicon, install Rosetta: softwareupdate --install-rosetta"
  fi

  log "solc 0.7.4 installed"
  echo "$target"
}

# Print a dependency status report; never fails, just reports.
doctor() {
  local ok=1

  printf '\n%-22s' "node"
  if command -v node >/dev/null 2>&1; then
    local v
    v=$(node --version)
    if [[ "${v#v}" =~ ^([0-9]+) && "${BASH_REMATCH[1]}" -ge 18 ]]; then
      printf '  ✓ %s\n' "$v"
    else
      printf '  ✗ %s (need >= 18)\n' "$v"
      ok=0
    fi
  else
    printf '  ✗ not found — install from https://nodejs.org\n'
    ok=0
  fi

  printf '%-22s' "anvil (foundry)"
  if command -v anvil >/dev/null 2>&1; then
    printf '  ✓ %s\n' "$(anvil --version 2>&1 | head -n1)"
  else
    printf '  ✗ not found — curl -L https://foundry.paradigm.xyz | bash && foundryup\n'
    ok=0
  fi

  printf '%-22s' "forge (foundry)"
  if command -v forge >/dev/null 2>&1; then
    printf '  ✓ %s\n' "$(forge --version 2>&1 | head -n1)"
  else
    printf '  ✗ not found (comes with Foundry)\n'
    ok=0
  fi

  printf '%-22s' "cast (foundry)"
  if command -v cast >/dev/null 2>&1; then
    printf '  ✓ %s\n' "$(cast --version 2>&1 | head -n1)"
  else
    printf '  ✗ not found (comes with Foundry)\n'
    ok=0
  fi

  printf '%-22s' "solc 0.7.4"
  if path=$(resolve_solc); then
    printf '  ✓ %s\n' "$path"
  else
    printf '  ✗ not found — run: ./scripts/run-all.sh --install-solc\n'
    ok=0
  fi

  echo
  if [[ "$ok" -eq 1 ]]; then
    log "all dependencies satisfied — you can run: npm start"
  else
    warn "some dependencies are missing; address the ✗ lines above"
    return 1
  fi
}

chain_alive() {
  local port="$1"
  curl -s --max-time 1 -X POST -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId"}' \
    "http://127.0.0.1:$port" 2>/dev/null | grep -q '"result"'
}

backend_alive() {
  curl -s --max-time 1 "http://127.0.0.1:$BACKEND_PORT/api/health" 2>/dev/null | grep -q '"ok":true'
}

contracts_deployed() {
  local deployments="$ROOT_DIR/data/deployments.json"
  [[ -f "$deployments" ]] || return 1
  local escrow
  escrow=$(grep -m1 '"IntentEscrow"' "$deployments" | sed -E 's/.*"(0x[a-fA-F0-9]{40})".*/\1/') || return 1
  [[ -n "$escrow" ]] || return 1
  local code
  code=$(curl -s --max-time 2 -X POST -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getCode\",\"params\":[\"$escrow\",\"latest\"]}" \
    http://127.0.0.1:8545 | sed -E 's/.*"result":"([^"]+)".*/\1/')
  [[ "$code" != "0x" && -n "$code" ]]
}

stop_backend() {
  if pgrep -f "node backend/server.mjs" >/dev/null 2>&1; then
    log "stopping backend"
    pkill -f "node backend/server.mjs" || true
    sleep 1
  fi
}

# ---------- stop branch ----------

if [[ "$MODE" == "stop" ]]; then
  stop_backend
  bash "$ROOT_DIR/scripts/stop-chains.sh" || true
  log "everything stopped"
  exit 0
fi

# ---------- doctor branch ----------

if [[ "$MODE" == "doctor" ]]; then
  doctor
  exit $?
fi

# ---------- install-solc branch ----------

if [[ "$MODE" == "install-solc" ]]; then
  install_solc >/dev/null
  log "you can now run: npm start"
  exit 0
fi

# ---------- simulated branch (no Foundry / solc needed) ----------

if [[ "$MODE" == "simulated" ]]; then
  command -v node >/dev/null 2>&1 || die "node not found in PATH. Install Node.js >= 18."
  stop_backend
  log "starting backend in simulated mode on port $BACKEND_PORT"
  cd "$ROOT_DIR"
  exec node backend/server.mjs
fi

# ---------- on-chain branch ----------

command -v node >/dev/null 2>&1 || die "node not found. Install Node.js >= 18."
command -v anvil >/dev/null 2>&1 || die "anvil not found in PATH. Install Foundry: curl -L https://foundry.paradigm.xyz | bash && foundryup"
command -v cast >/dev/null 2>&1 || die "cast not found in PATH. Install Foundry (comes with anvil)."
command -v forge >/dev/null 2>&1 || die "forge not found in PATH. Install Foundry (comes with anvil)."

SOLC_PATH=""
if ! SOLC_PATH=$(resolve_solc); then
  warn "solc 0.7.4 not found — attempting auto-install"
  SOLC_PATH=$(install_solc)
fi
log "using solc 0.7.4 at $SOLC_PATH"
export LOCAL_SOLC_PATH="$SOLC_PATH"

# 1. chains
need_chains=0
for port in 8545 8546 8547 8548; do
  chain_alive "$port" || { need_chains=1; break; }
done

if [[ "$need_chains" -eq 1 ]]; then
  log "anvil chains not all up; (re)starting"
  bash "$ROOT_DIR/scripts/start-chains.sh"
  # Wait for all four chains to respond before continuing.
  for port in 8545 8546 8547 8548; do
    for attempt in $(seq 1 20); do
      if chain_alive "$port"; then break; fi
      sleep 0.25
    done
    chain_alive "$port" || die "chain on port $port never came up"
  done
else
  log "anvil chains already responding"
fi

# 2. contracts
if contracts_deployed; then
  log "contracts already deployed (deployments.json verified on-chain)"
else
  log "deploying contracts to all four chains"
  node "$ROOT_DIR/scripts/deploy.mjs"
fi

# 3. backend
stop_backend
log "starting backend in ON-CHAIN mode on http://127.0.0.1:$BACKEND_PORT"
log "frontend ready in 1-2 seconds — open the browser when this script prints 'IntentRoute running'"
log "press Ctrl-C to stop the backend (chains keep running; use --stop to tear them down too)"
cd "$ROOT_DIR"
exec env ONCHAIN_MODE=1 node backend/server.mjs
