# ERC-4337 × Intent Integration

> Companion doc for IntentRoute (Option 6). The course brief explicitly suggests
> *"combine ideas from account abstraction, intents, and modular blockchains."*
> This document explains why the two abstractions are complementary, sketches the minimal AA layer we shipped in this repo ([contracts/src/SmartAccount.sol](../contracts/src/SmartAccount.sol) and [contracts/src/IntentEntryPoint.sol](../contracts/src/IntentEntryPoint.sol)), and shows where the production trust assumptions appear.

---

## 1. Why intents and ERC-4337 want each other

Intents say **what** the user wants. ERC-4337 says **how** the user authorises any state change without an EOA. They sit at different layers:

| Layer | Question | IntentRoute primitive | ERC-4337 primitive |
|---|---|---|---|
| Outcome | What result do I want? | `Intent` JSON (transfer / swap / transfer_and_execute) | — |
| Authorisation | How is this signed and gas paid? | — | `UserOperation` + paymaster |
| Routing | Where is the result executed? | Off-chain router scoring | — |
| Settlement | Who anchors on-chain? | `IntentEscrow` + `SettlementRegistry` | Smart account `execute` |

Without AA, the user must:
1. own a funded EOA on the source chain,
2. pay gas in the source chain's native asset,
3. submit one tx per intent (deposit + later steps if any).

With ERC-4337 + intent routing the user instead:
1. owns a contract account (no source-chain ETH required),
2. signs a `UserOperation` whose `callData` is `IntentEscrow.depositIntent(...)`,
3. lets a bundler / relayer submit and pay gas; a paymaster sponsors gas if desired.

That collapses the friction the Option 6 brief calls out ("manual chain selection hurts usability and creates scalability friction at the user-access layer") **and** eliminates the prerequisite EOA balance per source chain. The two abstractions stack cleanly.

---

## 2. What we shipped

A minimal, **course-scope** AA layer that demonstrates the integration without reimplementing the full spec.

### 2.1 `SmartAccount` ([contracts/src/SmartAccount.sol](../contracts/src/SmartAccount.sol))

- Single ECDSA owner (`owner`).
- Single trusted `entryPoint` set at construction.
- Monotonic `nonce` advanced inside `validateUserOp` on a *valid* signature only. (Replay-protection: a bad signature does **not** consume the nonce — verified by `testRejectsBadSignatureWithoutAdvancingNonce`.)
- `userOpHash` binds: `(account, nonce, target, value, keccak(callData), gasLimit, chainId)`. Chain-id binding prevents cross-rollup replay — important for our cross-rollup setting.
- `execute(op)` is `onlyEntryPoint` and forwards a low-level call with the op's gas limit. Reverts surface the original revert reason for easier debugging.

What we omitted vs. the full ERC-4337:
- no `initCode` / factory creation;
- no paymaster validation (`paymasterAndData`);
- no prefund / gas-refund accounting;
- no bundler-side simulation rules (`validateUserOp` is straightforward; in production it must avoid storage that isn't allow-listed for bundler safety).

These are the right shortcuts for a course MVP and are called out so the demo narrative stays honest.

### 2.2 `IntentEntryPoint` ([contracts/src/IntentEntryPoint.sol](../contracts/src/IntentEntryPoint.sol))

- `handleOps(UserOperation[])` mirrors the production hook name.
- For each op: ask the account to validate, then execute; emit `UserOperationExecuted` or `UserOperationRejected` with a reason.
- Catches reverts from `account.execute` so a bad op in a batch doesn't roll back the others (matches production bundler semantics).

### 2.3 The test

[contracts/test/SmartAccount.t.sol](../contracts/test/SmartAccount.t.sol) demonstrates the full path:

1. SmartAccount is funded with mock USDC.
2. Owner signs a `UserOperation` whose callData is `MockERC20.approve(escrow, max)`.
3. EntryPoint executes the op; allowance is set, nonce advances.
4. Owner signs a second op whose callData is `IntentEscrow.depositIntent(intentId, token, 100e6, 9000, 9101)`.
5. EntryPoint executes the op; the escrow now records the smart account as the depositor.

A negative test (`testRejectsBadSignatureWithoutAdvancingNonce`) flips one byte of the signature and asserts: (a) handleOps does not revert, (b) the nonce stays at 0, (c) no allowance is applied. This is the property the production EntryPoint also requires.

All 5 contract tests pass under solc 0.7.4 (3 escrow + 2 smart-account).

---

## 3. End-to-end flow with AA enabled

```
┌──────────────┐     1. signed UserOp     ┌─────────────────┐
│ User wallet  │ ───────────────────────▶ │ Backend router  │
│ (any device) │                          │ + relayer       │
└──────────────┘                          └────────┬────────┘
                                                   │ 2. quote candidate routes
                                                   ▼
                                          ┌─────────────────┐
                                          │ Off-chain       │
                                          │ scorer          │
                                          └────────┬────────┘
                                                   │ 3. handleOps([op])
                                                   ▼
                       Origin chain (9000)  ┌─────────────────┐
                                            │ IntentEntryPoint│
                                            └────────┬────────┘
                                                     │ validateUserOp → execute
                                                     ▼
                                            ┌─────────────────┐
                                            │ SmartAccount    │
                                            │ .execute        │───▶ IntentEscrow.depositIntent
                                            └─────────────────┘                │
                                                                               ▼
                                                             Lifecycle (mark submitted/filled/settled)
                                                             unchanged from non-AA path.
```

Key property: **the user signs once.** All lifecycle marks (`markSubmitted`, `markFilled`, `markSettled`) remain owner-only on the escrow and are driven by the relayer; no further signatures are required from the user. This matches how production intent + AA systems (1inch Fusion+, ERC-7683 reference implementations) structure the UX.

---

## 4. Trust assumptions added by AA (and which existing ones it removes)

Cross-referenced with [trust_and_decentralization.md](trust_and_decentralization.md).

### Added by AA

- **Bundler / relayer can censor.** The bundler chooses which UserOps to include. Mitigation: multiple bundlers / mempools (production ERC-4337 has a public alt-mempool).
- **`EntryPoint` is load-bearing.** The user trusts the EntryPoint code; this is why production deployments use a single audited EntryPoint per chain.
- **Smart account upgrade risk.** Our minimal account is non-upgradable, so this is not an issue here. Real production accounts often use UUPS proxies and inherit the standard trust-the-proxy-admin risk.

### Removed by AA

- **Per-source-chain EOA gas balance.** With a paymaster the user never needs ETH on the source chain. This eliminates a real onboarding friction in a multi-rollup world.
- **One signature per lifecycle step.** A naive EOA implementation might want a user signature for each escrow mark — AA makes the original signed UserOp enough.

Net effect on the trilemma stance from §6 of [scalability_analysis.md](scalability_analysis.md): AA mostly improves the **user-access scalability** axis, neutralises some routing-layer centralisation risk (an alt-mempool of bundlers competes with the single relayer in our current design), and leaves base-chain security unchanged.

---

## 5. What we did *not* claim or implement

- We did not deploy the EntryPoint to all four local Anvil chains. The current onchain mode ([backend/lib/onchain-simulator.mjs](../backend/lib/onchain-simulator.mjs)) still uses the deployer key directly. Wiring it through the EntryPoint is mechanical (build a UserOp, call `handleOps`) and is logged as P2 in [待办事项.md](../myfiles/待办事项.md).
- We did not implement paymasters. A paymaster would let a router operator subsidise users' gas to bootstrap order flow — an interesting governance / incentive design question that belongs in [trust_and_decentralization.md §4.3](trust_and_decentralization.md).
- We did not enforce bundler-storage rules (ERC-4337 §6). Our minimal `validateUserOp` touches only the account's own storage, which already happens to satisfy the rule, but we did not run the validator.
- We did not integrate ERC-7683 standardized intent fields. The `UserOperation.callData` carries an ad-hoc `IntentEscrow.depositIntent` call; mapping that to `OrderData` is straightforward but deferred.

---

## 6. Why this still satisfies the course hint

The PDF hint reads:
> *"This project can combine ideas from **account abstraction**, intents, and modular blockchains."*

We combined them as follows:

| Idea | Where it shows up | Evidence |
|---|---|---|
| **Account abstraction** | `SmartAccount` + `IntentEntryPoint`, ECDSA-signed UserOps, replay-safe nonce, chain-id binding | [SmartAccount.t.sol](../contracts/test/SmartAccount.t.sol) (2 tests pass) |
| **Intents** | Outcome-based JSON in [intent-schema.mjs](../backend/lib/intent-schema.mjs); router selects environment, not user | [scalability_analysis.md](scalability_analysis.md) §1, §4 |
| **Modular blockchains** | Four local Anvil chains with distinct chainIds simulate execution-layer modularity; settlement and routing are split across off-chain (router) and on-chain (escrow + registry + vault) | [data/deployments.json](../data/deployments.json), [scripts/deploy.mjs](../scripts/deploy.mjs) |

The course brief asks for a story that connects these three ideas. The story is: *intents are the user's mental model, AA is how that mental model gets authorised without per-chain friction, and modular execution is the substrate the router actually picks from*.
