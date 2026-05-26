# IntentRoute Architecture

> Diagrams for the prototype. All sequence flows reflect what actually runs in [backend/lib/onchain-simulator.mjs](../backend/lib/onchain-simulator.mjs) when `ONCHAIN_MODE=1`, not an aspirational design.

---

## 1. System components

The off-chain control plane (router + relayer + adapter) sits next to four EVM chains. Settlement and execution touch chain state; routing decisions do not.

```mermaid
graph LR
  subgraph "Off-chain control plane"
    User[User]
    Frontend[Static frontend<br/>/index.html /charts.html]
    Backend[Node HTTP server<br/>backend/server.mjs]
    Router["Router<br/>backend/lib/router.mjs"]
    Adapter["Environment adapter<br/>backend/lib/environments.mjs"]
    Relayer["Relayer / on-chain simulator<br/>backend/lib/onchain-simulator.mjs"]
    ChainClient["Chain client<br/>backend/lib/chain-client.mjs<br/>(cast subprocess + per-RPC queue)"]
  end

  subgraph "Origin chain — Anvil :8545 / chainId 9000"
    Escrow[IntentEscrow]
    Registry[SettlementRegistry]
    TokensO[MockERC20<br/>mUSDC / mETH]
  end

  subgraph "Destination — FastRollup :8546 / 9101"
    VaultF[DestinationVault]
    PayF[PaymentReceiver]
    TokensF[MockERC20]
  end

  subgraph "Destination — CheapRollup :8547 / 9102"
    VaultC[DestinationVault]
    PayC[PaymentReceiver]
    TokensC[MockERC20]
  end

  subgraph "Destination — CongestedRollup :8548 / 9103"
    VaultX[DestinationVault]
    PayX[PaymentReceiver]
    TokensX[MockERC20]
  end

  User --> Frontend
  Frontend -- HTTP --> Backend
  Backend --> Router
  Router --> Adapter
  Backend --> Relayer
  Relayer --> ChainClient

  ChainClient -- "deposit / mark*" --> Escrow
  Escrow --> Registry
  ChainClient -- "recordFill /<br/>recordFillAndExecute" --> VaultF
  ChainClient -- "recordFill" --> VaultC
  ChainClient -- "recordFill" --> VaultX
  VaultF --> PayF
  VaultC --> PayC
  VaultX --> PayX
```

Key invariants encoded in this picture:

- Routing is **purely off-chain**. The chains never run the score function.
- The on-chain footprint is **escrow + registry on origin** + **vault + receiver per destination**. There is no synchronous cross-chain call.
- The relayer is the only actor that touches multiple chains within one intent.

---

## 2. Intent lifecycle (on-chain mode, happy path)

For a `transfer` intent settled to `CheapRollup`. Each numbered step is a real transaction signed by the deployer key.

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant FE as Frontend
  participant BE as Backend
  participant RT as Router
  participant RL as Relayer
  participant ES as IntentEscrow<br/>(origin)
  participant SR as SettlementRegistry<br/>(origin)
  participant DV as DestinationVault<br/>(cheap-rollup)

  U->>FE: Submit intent (amount, recipient, preference)
  FE->>BE: POST /api/intents/submit
  BE->>RT: quoteIntent(intent)
  RT-->>BE: candidates + selectedRoute + explanation
  BE->>BE: saveIntent (status=created)
  BE->>RL: startExecutionOnChain(record)

  RL->>ES: depositIntent(id, token, amount, src, dst)
  ES->>SR: registerEscrow
  ES-->>RL: tx receipt (≈335k gas)

  Note over RL: setTimeout(400ms)
  RL->>ES: markSubmitted(id)
  ES->>SR: updateStatus(Submitted)
  ES-->>RL: tx receipt (49k gas)

  Note over RL: setTimeout(0.45 × lifecycleMs)
  RL->>DV: recordFill(id, token, recipient, amount)
  DV-->>RL: tx receipt (≈148k gas)
  RL->>ES: markFilled(id)
  ES->>SR: updateStatus(Filled)
  ES-->>RL: tx receipt (49k gas)

  Note over RL: setTimeout(0.85 × lifecycleMs)
  RL->>ES: markSettled(id)
  ES->>SR: updateStatus(Settled)
  ES-->>RL: tx receipt (49k gas)

  FE->>BE: GET /api/intents/:id (poll)
  BE-->>FE: lifecycle events with tx hashes
```

Total wall time ~3-8 seconds depending on `route.estimatedLatencyMs`. Gas budget per intent: ~580k across origin + destination.

---

## 3. Failure / refund path

Triggered when `forceOutcome: "failure"` is set, or when the seeded RNG exceeds `route.successProbability`. The escrow guarantees funds end up back with the depositor and never elsewhere — this is the safety property we surface in [trust_and_decentralization.md](trust_and_decentralization.md#8-one-paragraph-summary-for-the-demo---slides).

```mermaid
sequenceDiagram
  autonumber
  participant RL as Relayer
  participant ES as IntentEscrow
  participant SR as SettlementRegistry
  participant U as User wallet

  Note over RL: decideFailure → true
  RL->>ES: markFailed(id)
  ES->>SR: updateStatus(Failed)
  ES-->>RL: tx receipt (49k gas)

  RL->>ES: refund(id)
  ES->>U: MockERC20.transfer(depositor, amount)
  ES->>SR: updateStatus(Refunded)
  ES-->>RL: tx receipt (~82k gas)

  Note over ES,U: refund() always sends to deposit.depositor.<br/>Funds-stuck is possible (no permissionless<br/>refundAfterDeadline yet); funds-stolen is not.
```

---

## 4. transfer_and_execute (merchant path)

The destination-side fill runs `recordFillAndExecute`, which transfers tokens to the user and then calls a target contract (`PaymentReceiver` by default) inside the same transaction. Any revert in the target rolls back the entire fill.

```mermaid
sequenceDiagram
  autonumber
  participant RL as Relayer
  participant DV as DestinationVault
  participant TK as MockERC20
  participant PR as PaymentReceiver
  participant U as Recipient

  RL->>DV: recordFillAndExecute(id, token, recipient,<br/>amount, target=PaymentReceiver, callData)
  DV->>TK: transfer(recipient, amount)
  TK-->>U: balance += amount
  DV->>PR: acknowledge(intentId, payer, amount, ref)
  PR-->>DV: ok
  DV-->>RL: tx receipt (≈250k gas vs 148k for plain fill)
```

The gas delta (~100k) is the merchant-side bookkeeping plus the cross-contract call overhead. It is visible in the frontend timeline, which is how the demo justifies the stretch use case empirically.

---

## 5. ERC-4337 layer (when used)

`IntentEntryPoint.handleOps` validates the signature and executes `IntentEscrow.depositIntent` via the smart account. The user signs the intent once; the bundler pays origin-chain gas. See [erc4337_integration.md](erc4337_integration.md) for the prose version.

```mermaid
sequenceDiagram
  autonumber
  participant U as User wallet
  participant B as Bundler / relayer
  participant EP as IntentEntryPoint
  participant SA as SmartAccount
  participant TK as MockERC20
  participant ES as IntentEscrow

  U->>U: Sign UserOperation<br/>callData = depositIntent(...)
  U->>B: ship signed op
  B->>EP: handleOps([op])
  EP->>SA: validateUserOp(op, userOpHash)
  SA->>SA: verify ECDSA, check nonce, bump nonce
  SA-->>EP: 0 (valid)
  EP->>SA: execute(op)
  SA->>TK: approve(escrow, max)  [first op only]
  SA->>ES: depositIntent(...)
  ES-->>SA: ok
  SA-->>EP: result
  EP-->>B: UserOperationExecuted event
```

Note: in the prototype the on-chain simulator does **not** route through `IntentEntryPoint` today — it calls `IntentEscrow.depositIntent` directly with the deployer key. The AA wiring is exercised by [SmartAccount.t.sol](../contracts/test/SmartAccount.t.sol). Moving the simulator onto the EntryPoint is a tier-2 follow-up (see [erc4337_integration.md §5](erc4337_integration.md#5-what-we-did-not-claim-or-implement)).

---

## 6. Routing decision flow

What the router actually does for each `quoteIntent` call.

```mermaid
flowchart TD
  start([User intent]) --> validate{Schema<br/>valid?}
  validate -- no --> reject[422 invalid_intent]
  validate -- yes --> generate[Generate 3 candidates<br/>per environment]

  generate --> hard{For each<br/>candidate:<br/>hard constraints OK?}
  hard -- "tokenIn≠tokenOut for non-swap<br/>minAmountOut violated<br/>deadline expired<br/>successProb < 0.55" --> invalidate[Mark invalid]
  hard -- yes --> mark[Mark valid]

  invalidate --> any{any valid<br/>candidates?}
  mark --> any
  any -- no --> nopath[Return null selectedRoute<br/>+ explanations per failure]
  any -- yes --> normalize[Normalize fee / latency /<br/>congestion / reliability<br/>via min-max range]

  normalize --> weight{preference}
  weight -- balanced --> wb["{cost 0.30, lat 0.25,<br/>rel 0.25, cong 0.20}"]
  weight -- cheapest --> wc["{cost 0.55, lat 0.10,<br/>rel 0.15, cong 0.20}"]
  weight -- fastest --> wf["{cost 0.10, lat 0.50,<br/>rel 0.25, cong 0.15}"]
  weight -- reliable --> wr["{cost 0.10, lat 0.15,<br/>rel 0.50, cong 0.25}"]
  weight -- custom --> wcust[User weights<br/>renormalised to 1]

  wb --> score
  wc --> score
  wf --> score
  wr --> score
  wcust --> score

  score[Composite score per candidate] --> rank[Sort by score, attach rank]
  rank --> explain[Build 2-3 reason explanation<br/>per top-ranked route]
  explain --> done([Return ranked candidates + selectedRoute])
```

The four hard-constraint paths and the deterministic weight presets are also the units of `backend/lib/router.test.mjs` — every diamond above has a test that asserts the behaviour.

---

## 7. Trust surface (visual)

A condensed view of [trust_and_decentralization.md §2-3](trust_and_decentralization.md). Each edge is something a user has to trust today.

```mermaid
flowchart LR
  user[User] -- "signs intent" --> router[Router]
  router -- "trusts data" --> adapter[Environment adapter]
  router -- "delegates execution" --> relayer[Relayer]
  relayer -- "calls onlyOwner" --> escrow[IntentEscrow]
  escrow -- "writes status" --> registry[SettlementRegistry]
  relayer -- "calls onlyOwner" --> vault[DestinationVault]

  classDef weak fill:#fde68a,stroke:#b45309,color:#7c2d12;
  classDef strong fill:#bbf7d0,stroke:#15803d,color:#14532d;

  class user,registry strong
  class router,adapter,relayer,escrow,vault weak
```

Yellow nodes are positions where today's prototype concentrates trust into a single party. Green nodes are positions where the on-chain code does not require trust beyond the chain itself. Migrating yellow → green is the agenda of the tier-1/2/3 roadmap in the trust document.

---

## 8. How the documents connect

```mermaid
graph TD
  README -.-> ARCH[architecture.md<br/>this file]
  README --> SCAL[scalability_analysis.md]
  README --> TRUST[trust_and_decentralization.md]
  README --> AA[erc4337_integration.md]
  README --> SC7683[erc7683_mapping.md]
  README --> PRIV[privacy_tradeoffs.md]
  README --> REQ[option6_requirements_plan.md]

  ARCH -.-> SCAL
  ARCH -.-> TRUST
  ARCH -.-> AA
  SCAL -.-> TRUST
  AA -.-> SC7683
  TRUST -.-> SCAL
  PRIV -.-> TRUST
```

`README.md` is the entrypoint; everything else is reachable in two hops.
