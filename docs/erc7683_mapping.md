# ERC-7683 × IntentRoute Field Mapping

> Companion to [erc4337_integration.md](erc4337_integration.md). ERC-7683 standardises **cross-chain intent orders** (settler / filler roles, signed `OrderData`, etc.). Even though our prototype carries an ad-hoc JSON intent over HTTP, the schema lines up cleanly with the standard. This document is the mapping a future migration would follow.

References:
- [ERC-7683: Cross Chain Intents Standard](https://eips.ethereum.org/EIPS/eip-7683) (draft)
- Across' reference implementation: `OrderData`, `ResolvedCrossChainOrder`
- IntentRoute schema: [backend/lib/intent-schema.mjs](../backend/lib/intent-schema.mjs)

---

## 1. Top-level order envelope

ERC-7683 defines a `CrossChainOrder` envelope. Our intent JSON maps as follows:

| ERC-7683 field | Type | IntentRoute equivalent | Notes |
|---|---|---|---|
| `settlementContract` | `address` | `data.deployments.chains.origin.contracts.IntentEscrow` | Our escrow plays the settler role. |
| `swapper` | `address` | `intent.recipient` (today) / `SmartAccount.owner` (with AA) | Production would use the signing account; we conflate it with the recipient in the simple flow. |
| `nonce` | `uint256` | `intent.intentId` (hashed) | We hash the string id with `keccak256` before on-chain use ([chain-client.mjs:keccakIntentId](../backend/lib/chain-client.mjs)). |
| `originChainId` | `uint256` | `intent.sourceChainId` | Identical. |
| `initiateDeadline` | `uint32` | `intent.deadline` | We store ISO-8601 then convert at the boundary. |
| `fillDeadline` | `uint32` | derived from `route.estimatedLatencyMs` | Not part of the user intent today; would be inferred from the selected route. |
| `orderDataType` | `bytes32` | constant identifier for the intent type | One per `intentType` value: transfer, transfer_and_execute, swap. |
| `orderData` | `bytes` | ABI-encoded extension struct | See §2 per type. |

---

## 2. Per-intent-type `orderData` payloads

### 2.1 `transfer`

```solidity
struct TransferOrderData {
    address inputToken;
    uint256 inputAmount;
    address recipient;
    uint32  destinationChainId;
    address outputToken;
    uint256 minAmountOut;
    bytes32 preferenceTag;     // "balanced" | "cheapest" | "fastest" | "reliable" | "custom"
    uint256[4] customWeights;  // 1e18-scaled weights for cost,latency,reliability,congestion
}
```

| ERC-7683 sub-field | IntentRoute |
|---|---|
| `inputToken` | resolved from `intent.tokenIn` (mUSDC / mETH) |
| `inputAmount` | `toBaseUnits(intent.amountIn, symbol)` ([chain-client.mjs](../backend/lib/chain-client.mjs)) |
| `recipient` | `intent.recipient` |
| `destinationChainId` | `selectedRoute.destinationChainId` |
| `outputToken` | `intent.tokenOut` resolved |
| `minAmountOut` | `intent.minAmountOut` |
| `preferenceTag` + `customWeights` | `intent.preference` (+ `intent.customWeights` when `custom`) |

### 2.2 `transfer_and_execute`

Extends 2.1 with an execution rider:

```solidity
struct TransferAndExecuteOrderData {
    TransferOrderData base;
    address target;       // == intent.executionTarget (or 0 ⇒ PaymentReceiver auto-resolve)
    bytes   callData;     // == intent.executionPayload (else acknowledge(intentId, recipient, amount, ref))
}
```

The current implementation produces the `callData` on the fly via `cast calldata` in [onchain-simulator.mjs:fillOnDestination](../backend/lib/onchain-simulator.mjs); in an ERC-7683-compliant version the user would sign the `callData` so the filler cannot tamper with it.

### 2.3 `swap`

```solidity
struct SwapOrderData {
    address inputToken;
    uint256 inputAmount;
    address outputToken;
    uint256 minAmountOut;
    address recipient;
    uint32  destinationChainId;
    bytes32 routeQuoteCommitment;  // keccak(selectedRoute) — see §4
}
```

`expectedAmountOut` (per environment) comes from [environments.mjs:quoteSwapAmountOut](../backend/lib/environments.mjs) and is what production resolvers would compete on. For the prototype the resolver is the same backend; the `routeQuoteCommitment` would let a future filler verify against the off-chain quote.

---

## 3. Filler / settler roles

| ERC-7683 role | IntentRoute realisation |
|---|---|
| **Settler** on origin chain | `IntentEscrow` ([contracts/src/IntentEscrow.sol](../contracts/src/IntentEscrow.sol)). Holds funds, marks lifecycle. |
| **Filler** on destination chain | `DestinationVault` ([contracts/src/DestinationVault.sol](../contracts/src/DestinationVault.sol)) with the deployer key as the relayer. Production would split filler from settlement owner. |
| **Resolver / quote provider** | Off-chain router ([backend/lib/router.mjs](../backend/lib/router.mjs)). |
| **`resolve(order)`** view function | Equivalent of our `/api/intents/quote` HTTP endpoint. |
| **`fill(order, fillerData)`** | `DestinationVault.recordFill` or `recordFillAndExecute`. |

---

## 4. Trust deltas if we migrated to ERC-7683

Moving from JSON-over-HTTP to signed `OrderData` would close three of the trust gaps in [trust_and_decentralization.md](trust_and_decentralization.md):

1. **§3-A Router quote integrity.** A `routeQuoteCommitment` bound to the user signature means a tampered route is detectable on-chain — settler can refuse to release escrow if the filler's reported destination doesn't match.
2. **§3-C Relayer faithful fill.** ERC-7683 routes `fill()` through the standardised settler; the destination is part of the signed order, not mutable router state.
3. **§4.1 Router chokepoint.** Anyone can implement `resolve(order)`; competing routers can offer quotes. The user picks the best one and signs it.

What it does **not** close:
- The escrow `onlyOwner` problem remains (still requires `refundAfterDeadline`; tracked in [待办事项 §6 Tier-1 #1](../myfiles/待办事项.md)).
- Cross-rollup data availability for the order JSON itself — handled in production by alt-mempools or shared sequencer networks.

---

## 5. Why we did not implement 7683 today

- The standard is still **draft** (no final EIP number assigned). Building against it now risks rework when the schema lands.
- Most production "intent" systems (Across, CoW, 1inch Fusion+) ship custom `OrderData` shapes and post-hoc claim ERC-7683-compatibility once the field set stabilises.
- The mapping above is a 1-day refactor: keep the JSON, add an ABI-encoder layer, switch the API to accept a signed envelope. The course MVP does not need this.

---

## 6. One-paragraph framing for the demo

> Our JSON intent and on-chain settler/filler split already mirror the structure ERC-7683 is standardising; the migration is a thin adapter (ABI-encode + signed envelope) rather than a redesign. We document the field-by-field mapping here so that an ERC-7683-aware reviewer can see the prototype is forward-compatible, and so the trust improvements §4 enumerates can be reasoned about today, even though we have not yet shipped them.
