#!/usr/bin/env bash
#
# Deploy the HarvestLink contracts to the Stellar testnet, initialize them, wire
# them together and seed demo data (oracle prices + starter liquidity).
#
# Prereqs: rust + wasm32v1-none target + stellar CLI on PATH, network access.
# Usage:   ./scripts/deploy_testnet.sh
#
set -euo pipefail

export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"

NET="${STELLAR_NETWORK:-testnet}"
SRC="${DEPLOYER:-harvestlink-deployer}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WASM="$ROOT/contracts/target/wasm32v1-none/release"
OUT="$ROOT/deployments"
mkdir -p "$OUT"

log() { printf "\n\033[1;32m==>\033[0m %s\n" "$*"; }

# --- 0. Build if artifacts are missing ------------------------------------
if [ ! -f "$WASM/lending_pool.wasm" ]; then
  log "Building contracts..."
  (cd "$ROOT/contracts" && stellar contract build)
fi

# --- 1. Deployer identity --------------------------------------------------
if ! stellar keys address "$SRC" >/dev/null 2>&1; then
  log "Generating + funding deployer identity '$SRC'"
  stellar keys generate "$SRC" --network "$NET" --fund
fi
ADMIN="$(stellar keys address "$SRC")"
log "Deployer / admin: $ADMIN"

# --- 2. Deploy the four contracts -----------------------------------------
deploy() {
  stellar contract deploy --wasm "$WASM/$1" --source "$SRC" --network "$NET" 2>/dev/null
}
log "Deploying token (mock USDC)";  TOKEN_ID="$(deploy token.wasm)";        echo "  $TOKEN_ID"
log "Deploying oracle";             ORACLE_ID="$(deploy oracle.wasm)";      echo "  $ORACLE_ID"
log "Deploying receipt";            RECEIPT_ID="$(deploy receipt.wasm)";    echo "  $RECEIPT_ID"
log "Deploying lending-pool";       POOL_ID="$(deploy lending_pool.wasm)";  echo "  $POOL_ID"

inv() { stellar contract invoke --id "$1" --source "$SRC" --network "$NET" -- "${@:2}"; }

# --- 3. Initialize ---------------------------------------------------------
log "Initializing token"
inv "$TOKEN_ID" initialize --admin "$ADMIN" --decimals 7 --name "HarvestLink USD" --symbol hlUSDC

log "Initializing oracle (max 50% per-update deviation, 24 samples)"
inv "$ORACLE_ID" initialize --admin "$ADMIN" --max_deviation_bps 5000 --max_samples 24

log "Initializing receipt (warehouse + inspector = deployer for the pilot)"
inv "$RECEIPT_ID" initialize --admin "$ADMIN" --warehouse "$ADMIN" --inspector "$ADMIN"

log "Initializing lending-pool (LTV 65%, liq 80%, APR 12%, TWAP 300s)"
inv "$POOL_ID" initialize \
  --usdc "$TOKEN_ID" --oracle "$ORACLE_ID" --receipt "$RECEIPT_ID" \
  --ltv_bps 6500 --liq_threshold_bps 8000 --apr_bps 1200 --twap_window 300

# --- 4. Seed oracle prices (USD/kg, 7 decimals) ----------------------------
log "Seeding oracle prices"
inv "$ORACLE_ID" set_price --asset WHEAT  --price 3000000    # $0.30/kg
inv "$ORACLE_ID" set_price --asset RICE   --price 4200000    # $0.42/kg
inv "$ORACLE_ID" set_price --asset COFFEE --price 52000000   # $5.20/kg

# --- 5. Seed pool liquidity -----------------------------------------------
log "Minting 200,000 test-USDC to admin and supplying 100,000 to the pool"
inv "$TOKEN_ID" mint   --to "$ADMIN" --amount 2000000000000     # 200,000.0000000
inv "$POOL_ID"  supply --lp "$ADMIN" --amount 1000000000000     # 100,000.0000000

# --- 6. Persist deployment addresses --------------------------------------
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$OUT/testnet.json" <<EOF
{
  "network": "testnet",
  "rpcUrl": "https://soroban-testnet.stellar.org",
  "networkPassphrase": "Test SDF Network ; September 2015",
  "deployedAt": "$STAMP",
  "admin": "$ADMIN",
  "contracts": {
    "token":  "$TOKEN_ID",
    "oracle": "$ORACLE_ID",
    "receipt": "$RECEIPT_ID",
    "pool":   "$POOL_ID"
  },
  "crops": ["WHEAT", "RICE", "COFFEE"]
}
EOF

log "Deployment complete. Addresses written to deployments/testnet.json"
cat "$OUT/testnet.json"
