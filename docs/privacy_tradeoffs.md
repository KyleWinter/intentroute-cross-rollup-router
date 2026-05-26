# Privacy ↔ Scalability Trade-offs

> Companion analysis. The SC6109 BYOP guidance lists "Privacy-Scalability Trade-offs" as one of the four course themes any project should connect to. Option 6 does not require privacy work, but an intent router has a real privacy story worth telling — what the router knows, what the chain reveals, and what an adversary can do with both.
>
> Cross-references: [trust_and_decentralization.md](trust_and_decentralization.md), [scalability_analysis.md](scalability_analysis.md), [erc4337_integration.md](erc4337_integration.md).

---

## 1. What the system reveals today

For every intent the user submits, the following information leaks somewhere:

| Field | Visible to | Persistence |
|---|---|---|
| `recipient` | Router, relayer, adapter, **on-chain** in `IntentEscrow.deposits` + every status event | Permanent (chain log) |
| `amountIn`, `tokenIn`, `tokenOut` | Same as above | Permanent |
| `preference` + `customWeights` | Router, relayer | Off-chain logs only |
| `forceOutcome` | Backend only | Off-chain logs only |
| `executionTarget` (for `transfer_and_execute`) | Router, relayer, **on-chain** in vault call | Permanent |
| `executionPayload` | Same as target | Permanent |
| Destination chain selected | **On-chain** in `Deposit.destinationChainId` | Permanent |
| The fact that a deposit happened on origin and a fill happened on destination | Anyone watching either chain | Permanent |

Two important things to notice:

1. **The intent envelope is plaintext on the wire.** The frontend `POST /api/intents/submit` is HTTP JSON, not an encrypted blob. A passive network observer (or a malicious bundler) sees everything.
2. **The chain log is more revealing than the intent.** The escrow contract emits `IntentDeposited(intentId, depositor, token, amount)` and `IntentStatusUpdated(intentId, status)`. Anyone watching `IntentEscrow` events on the origin chain reconstructs the user's full payment graph with chain analytics.

---

## 2. MEV / front-running risks specific to intent routing

Routing creates a structural information advantage for whoever sees the intent first. Concretely:

### 2.1 Pre-fill front-running

The router learns the intent **before** the destination chain does. A malicious router can:

- Submit its own buy on the destination chain ahead of the user's fill,
- Sandwich the fill,
- Or leak the intent to a friendly searcher who does the same.

Today the prototype runs router + relayer in one Node process, so the leak surface is small. In any production version with multiple bundlers, **this becomes a real attack vector that the standard `userOpHash`-binding does not address** because the user has to sign over the destination *before* there is any competition.

### 2.2 Quote-shopping leak

When the frontend calls `/api/intents/quote` for a preview, the router gets a free preview of the user's pending intent. The user has not yet committed — but the router can still:

- Build a market-making position ahead of the eventual `submit`,
- Refuse to give a good quote until the market moves in its favour,
- Discriminate quotes based on `recipient` reputation.

### 2.3 Cross-chain timing leak

`destinationChainId` is part of the on-chain `Deposit` record. Anyone watching `IntentDeposited` events on origin knows which destination chain the user will hit ~T seconds from now (`route.estimatedLatencyMs`). This is enough lead time for a watcher to:

- Position liquidity on the destination,
- Run JIT (just-in-time) LP attacks against any AMM fill,
- Front-run the destination-side `DestinationVault.recordFill` if the recipient is a contract that the watcher can interact with.

---

## 3. Where the trade-off with scalability lives

This is the crux of the BYOP theme. **The same architectural choices that give us user-access scalability also widen the privacy surface.**

| Scalability choice | Privacy cost |
|---|---|
| Off-chain router (so the user doesn't pay to compare chains) | The router sees plaintext intents (§2.1, §2.2) |
| Deterministic explanations (so the user can audit the choice) | The composite score reveals the user's preference profile to any observer with adapter access |
| On-chain escrow / registry (so the user gets a settled audit trail) | Deposit + status events leak the full payment graph (§1) |
| Multi-rollup routing (so capacity is utilised efficiently) | Destination-chain selection is public ⇒ §2.3 timing leak |
| `transfer_and_execute` (so users skip a second tx) | The execution target + payload is public on the destination chain |

A privacy-maximalist version of IntentRoute would have to give back some of those wins. The trade-off is not a free lunch.

---

## 4. Mitigation menu

We won't ship these — the course timeline doesn't allow it — but the trade-off discussion only makes sense if there are real escape hatches. The literature offers four families.

### 4.1 Commit-reveal on the intent envelope

User signs `hash(intent || salt)` to the escrow. Router quotes against a **blinded** intent (only the type + amount range), and the full intent is revealed to the relayer at fill time.

**Closes:** §2.1 router front-running.
**Cost:** quoting accuracy degrades (router can't see exact amounts, only buckets).
**Reference:** [Anoma's intent-resource model](https://anoma.net) and [SUAVE](https://writings.flashbots.net/the-future-of-mev-is-suave) both build along these lines.

### 4.2 Encrypted intent mempools

Intents are encrypted to a threshold of bundlers; the user's plaintext never reaches a single party. Only after the destination is committed do bundlers cooperatively decrypt and execute.

**Closes:** §2.1, §2.2.
**Cost:** new threshold-trust assumption (need ≥k honest bundlers) and ~1 RTT latency added to every quote.
**Reference:** CoW Protocol's batch auction has a similar effect via uniform clearing; [Shutter Network](https://shutter.network/) ships a more general threshold-encrypted mempool.

### 4.3 Shielded escrow (zero-knowledge)

Replace `IntentEscrow.depositIntent(id, token, amount, ...)` with `depositCommitment(commitment)` where `commitment = Poseidon(token || amount || nonce)`. A ZK proof at fill time shows that the commitment opens to a valid `(token, amount)` matching the destination fill.

**Closes:** §1 chain-log payment graph leak.
**Cost:** proof generation latency (hundreds of ms to seconds today); proving infrastructure (Circom/Halo2 toolchain); deposit + fill must agree on the same circuit.
**Reference:** [Aztec](https://docs.aztec.network/) and [Privacy Pools](https://www.privacypools.com/) for the deposit-commitment shape.

### 4.4 Recipient unlinkability via stealth addresses

Recipient is replaced by a stealth address ([ERC-5564](https://eips.ethereum.org/EIPS/eip-5564)) derived from a meta-address. Multiple intents to the same person no longer share an on-chain handle.

**Closes:** the "same recipient = same person" graph collapse in §1.
**Cost:** UX overhead (recipient has to scan for stealth payments); on-chain announcement contract is a separate moving piece; does not hide the *amount*.

---

## 5. Where this project sits in the privacy ↔ scalability plane

Roughly:

```
                      High privacy
                            │
                            │
                          ZK shielded
                          escrow (4.3)
                            │
                            │
                          Encrypted
                          mempool (4.2)
                            │
                  Commit-reveal (4.1)
                            │
                            │
                            │   ★ IntentRoute (today)
                            │   plaintext intents,
                            │   plaintext escrow events
                            │
       ───────────────────────────────── High scalability
                            │
                            │   Single fixed chain
                            │   (no routing)
                            │
                       Low scalability
                          Low privacy
```

The star marks where the prototype lives: **strong on user-access scalability, deliberately weak on intent-level privacy**. The mitigation menu above shows where we *could* move on the privacy axis — and what we'd give up to do it. The diagram should be read as a 2-axis sketch, not an empirical measurement.

---

## 6. Honest disclosures

- **We did not implement any of §4.** The code as committed reveals everything described in §1.
- **The router and relayer are colocated.** The leak surface in §2.1 is small in practice today, but the *architecture* permits it; a future deployment with independent bundlers inherits the risk without any code change.
- **TLS on the HTTP path is the only network-level protection.** That keeps a passive WAN observer out, but the backend operator and anyone reading server logs still sees plaintext intents.
- **`forceOutcome` is a demo affordance**, not a privacy switch. Real production code should not let users force failure — it would be abused for cheap cancellation.

---

## 7. One paragraph for the demo / final report

> IntentRoute trades intent-level privacy for user-access scalability — and we are explicit about it. The router sees plaintext intents, the chain logs reveal the full payment graph, and the routing decision itself leaks the user's preference profile. We do not mitigate any of this today; the architecture is positioned at the "fast, transparent, no zero-knowledge" corner of the privacy/scalability plane. A privacy-aware migration has four well-mapped pieces — commit-reveal, encrypted bundler mempools, ZK-shielded escrow, and stealth recipients — each of which closes a specific leak category at the cost of a measurable amount of routing efficiency. The trade-off is real and not negotiable away by clever engineering.
