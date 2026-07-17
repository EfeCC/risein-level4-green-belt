#!/usr/bin/env bash
#
# Update an oracle price (USD/kg, 7 decimals). Handy for demoing liquidation:
# step wheat down and a maxed-out loan becomes liquidatable.
#
# Usage: ./scripts/set_price.sh WHEAT 2000000     # sets wheat to $0.20/kg
#
set -euo pipefail
export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"

NET="${STELLAR_NETWORK:-testnet}"
SRC="${DEPLOYER:-harvestlink-deployer}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ORACLE="$(python3 -c "import json;print(json.load(open('$ROOT/deployments/testnet.json'))['contracts']['oracle'])")"

ASSET="${1:?usage: set_price.sh ASSET PRICE_7DP  (e.g. WHEAT 2000000)}"
PRICE="${2:?usage: set_price.sh ASSET PRICE_7DP  (e.g. WHEAT 2000000)}"

stellar contract invoke --id "$ORACLE" --source "$SRC" --network "$NET" -- \
  set_price --asset "$ASSET" --price "$PRICE"
echo "set $ASSET = $PRICE (7dp)"
