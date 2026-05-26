# Trust Assumptions and Decentralisation Risks

> Companion document to [scalability_analysis.md](scalability_analysis.md). The SC6109 course brief states, for Option 6:
>
> - *"Good teams will explain where trust assumptions lie in the router or relayer."*
> - *"Strong projects may discuss whether intent routing creates new centralisation risks."*
>
> This document answers both questions for the IntentRoute prototype: it enumerates every place a participant has to trust someone, classifies the resulting centralisation risks, compares them to production intent systems (Across, CoW, 1inch Fusion+, NEAR Intents), and outlines concrete mitigations — some implementable now, some left as future work.

---

## 1. Threat model in one sentence

> A user submits a signed intent and either escrows funds on the source chain or authorises a smart-wallet `UserOperation`. They expect the system to: (a) **not lose their funds**, (b) **not select a route that's actively worse than what an honest router would have selected**, (c) **eventually either settle the intent or refund the escrow**.

Every trust assumption below is a way one of (a), (b), (c) could be violated by a non-cooperating actor.

---

## 2. Actors and where trust currently lives

The prototype has five logical actors. The right-hand column is the failure each actor can inflict if they go rogue.

| Actor | Today's implementation | What they could do if malicious |
|---|---|---|
| **User** | Browser submits intent JSON to backend. | Submit malformed intents, spam quotes (rate-limit problem, not a safety problem). |
| **Router** (off-chain) | [backend/lib/router.mjs](../backend/lib/router.mjs) — single Node process scoring candidates with deterministic weights. | Return a sub-optimal "selectedRoute" that benefits a colluding relayer; censor users; front-run the user's intent. |
| **Environment adapter** (off-chain) | [backend/lib/environments.mjs](../backend/lib/environments.mjs) — supplies fee, latency, congestion, success-probability data. **Today these are simulated.** In a real deployment they would be oracles or live RPC probes. | Feed the router false congestion data to steer order flow. |
| **Relayer / solver simulator** | [backend/lib/simulator.mjs](../backend/lib/simulator.mjs) — currently a `setTimeout`-driven state machine; in a real deployment it would submit the destination-side fill. | Refuse to fill profitable intents; fill them on a different destination than promised; sandwich the fill. |
| **Settlement owner** | `IntentEscrow.owner` and `SettlementRegistry.owner` — a single EOA in deploy scripts (see [contracts/src/IntentEscrow.sol](../contracts/src/IntentEscrow.sol) and [contracts/src/SettlementRegistry.sol](../contracts/src/SettlementRegistry.sol)). All `markSubmitted / markFilled / markSettled / markFailed / refund` are `onlyOwner`. | Refuse to refund a stuck escrow; mark a non-settled intent as `Settled` and unlock funds. **This is the most concentrated power in the prototype.** |

These are the **only** participants whose honesty the system currently depends on. User funds in the escrow contract are safe from the router, the adapter, and the relayer — but they are **not** safe from the settlement owner.

---

## 3. Trust assumption inventory

Each assumption is rated as **load-bearing** (safety breaks if violated), **quality-bearing** (only execution quality degrades), or **liveness-bearing** (system can stall but funds are not lost).

### A. Router quote integrity — **quality-bearing**

- *Assumption:* The router scores all candidates honestly using the published policy weights.
- *What can go wrong:* The router silently weights a kickback-paying environment higher.
- *Why it's "only" quality:* The user's funds are escrowed on the source chain and can be refunded; a dishonest route can be slower or more expensive, but it cannot drain the escrow. The on-chain `SettlementRegistry` records the actually-used destination, so deviations from the quoted route are observable post-hoc.
- *Detection cost:* Easy — anyone can re-run the router on the same inputs and compare. The route explanation in [router.mjs:84](../backend/lib/router.mjs#L84) (`buildExplanation`) is deterministic in our prototype, so a dishonest quote can be challenged.

### B. Environment adapter honesty — **quality-bearing**

- *Assumption:* The `congestion`, `successProbability`, `feeBps`, and `baseLatencyMs` values supplied by the adapter are at least as accurate as a fresh independent probe.
- *What can go wrong:* The adapter exaggerates congestion on a competitor rollup so the router avoids it. This is the **most subtle** failure mode because the user-facing route explanation will look plausible.
- *Defence today:* Adapter outputs are pure functions of `(intentId, environmentId, scenario)` via `seededUnitInterval`, so they are reproducible.
- *Defence in production:* Multiple independent oracle feeds + outlier rejection; cryptographic attestations (TLSNotary-style) over the raw probe; reference scores from observers who don't earn fees.

### C. Relayer faithfully fills the selected route — **quality-bearing**

- *Assumption:* The relayer fills on the `destinationChainId` written into `IntentEscrow.deposits[intentId]` and recorded in `SettlementRegistry`.
- *What can go wrong:* Relayer fills on a cheaper destination than promised and pockets the spread; relayer extracts MEV by reordering the fill.
- *Defence today:* `IntentEscrow._updateStatus` writes the destination at deposit time and `SettlementRegistry.updateStatus` records every transition. Any divergence between quoted destination and on-chain fill is publicly visible.
- *Defence in production:* Make the destination commitment part of the user's signed intent (so the relayer is bound by signature, not by router state); use commit-reveal on the fill so it cannot be sandwiched.

### D. Settlement owner does not abuse `onlyOwner` — **load-bearing**

- *Assumption:* The single address that owns `IntentEscrow` and `SettlementRegistry` will not (i) mark unfilled intents as `Settled` and unlock escrow to the wrong party, or (ii) refuse to call `refund` on a stuck intent.
- *What can go wrong:* The owner can call `markSettled` on any intent and then drain... actually, **let's check.** Looking at [IntentEscrow.sol:86-96](../contracts/src/IntentEscrow.sol#L86-L96), `refund` is the only path that moves tokens out of the contract, and it always sends to `deposit.depositor`. So the owner can:
  - **Stall settlement** (refuse to call `markSettled` / `refund`) — liveness attack.
  - **Mis-mark status** to make a failed intent look successful, but **cannot redirect funds**. Funds always return to the original depositor or stay locked. This is a strong safety property of the current escrow design and worth highlighting in the demo.
- *Why this is still load-bearing:* Stalling refunds is functionally indistinguishable from fund loss from the user's perspective. There is no on-chain time-out.
- *Defence today:* None — `onlyOwner` is absolute.
- *Defence in production:*
  - Add a `refundAfterDeadline()` that any caller can invoke once `intent.deadline + grace` has passed.
  - Replace the EOA owner with a multisig or a small DAO.
  - Make `markFilled / markSettled` callable by anyone with a valid relayer signature instead of `onlyOwner`.

### E. Source chain liveness and re-org safety — **load-bearing, but inherited**

- *Assumption:* The source chain (where `IntentEscrow` lives) finalises blocks and does not deeply re-org.
- *What can go wrong:* A deep re-org could leave the escrow in an inconsistent state where the destination fill happened but the source-side `Escrowed` event got reverted.
- *Defence today:* Out of scope of the prototype; we assume L1-level finality on the source chain.

### F. Frontend / UI honesty — **quality-bearing**

- *Assumption:* The static frontend served from [frontend/](../frontend/) renders the actual quoted route, not a doctored one.
- *Defence today:* The frontend is open source and served from the same backend; users can run their own.

---

## 4. New centralisation risks introduced by intent routing

This is the second half of the course question: **does this architecture itself create centralisation risk that did not exist before?** The honest answer is yes, in three distinct ways.

### 4.1 The router becomes a chokepoint

In a multi-rollup world without IntentRoute, each user picks their own chain. There is no shared dependency. **A single off-chain router replaces N independent user decisions with one shared decision-maker.** This creates:

- **Censorship surface.** The router can refuse to quote certain recipients or token pairs (regulatory or commercial pressure).
- **Single point of failure.** A downed router takes the whole intent layer offline even though every underlying rollup is fine. Static policies have no such dependency.
- **Order-flow capture.** Whoever runs the router can sell access to relayers ("pay to be ranked first"). This is the intent-router analogue of the [order-flow auction debate around Uniswap X and CoW](https://docs.cow.fi).

### 4.2 The router has structural MEV power

Because the router sees the user's intent **before** any chain does, it has perfect information to:

- front-run on the destination chain;
- delay a quote until a friendly searcher is ready;
- leak intent contents to a preferred resolver pool.

Production systems mitigate this with: encrypted intent mempools (CoW, SUAVE), commit-reveal (Anoma), and competitive solver auctions where multiple solvers each see the intent simultaneously (Across, 1inch Fusion+). **The current prototype has none of these.**

### 4.3 Policy governance centralises route selection

The policy weights in [router.mjs:4](../backend/lib/router.mjs#L4) (`POLICY_WEIGHTS`) are hard-coded. In production this becomes a governance question: *who picks the weights?* Whoever controls the weights effectively decides where order flow goes, which is a **substantial economic privilege** over the participating rollups. This is genuinely a new failure mode: no fixed-chain user faces it.

---

## 5. Comparison with production intent systems

How do mature systems deal with the same risks? The table below maps each risk class to its standard mitigation, and notes what IntentRoute currently does.

| Risk class | Across | CoW Protocol | 1inch Fusion+ | NEAR Intents | **IntentRoute today** |
|---|---|---|---|---|---|
| Router quote integrity | RFQ to multiple relayers; user signs intended outcome | Solver auction; users sign limit orders | Resolver competition; verifiable execution | Solver competition with verifier contract | Single off-chain router; deterministic explanation only |
| Adapter / oracle honesty | Pricing comes from competing relayers, not a central oracle | Solvers source prices independently | Resolvers compete on prices | Solvers compete; verifier checks final state | Single simulated adapter; trusted by construction |
| Relayer faithful fill | On-chain dispute window + bond | Settlement contract enforces limit price | Signed maker order with hashlock | On-chain verifier contract | Status-only registry; no economic bonding |
| Settlement liveness | Time-locked refund | Auction batches close on schedule | Hashlock timelock | Verifier deadline | **None — `onlyOwner` refund** |
| MEV / front-running | Solver competition + private mempool | Batch auction with uniform clearing price | Resolver auctions | Encrypted intent mempool roadmap | Plaintext intent visible to router |
| Governance of routing policy | Decentralised over time | DAO-governed parameters | Resolver-set | Open solver set | Hard-coded weights |

> **Honest framing for the report and demo:** IntentRoute is a **single-router, single-relayer prototype** that anchors settlement on-chain. It is structurally closer to an RFQ aggregator with one quoter than to Across or CoW. The path from prototype to a production-grade decentralised intent network is mostly about replacing each "single" with "competition with on-chain verification" — that path is well-mapped by the systems above and is sketched in §6.

---

## 6. Mitigation roadmap

Concrete, implementable changes ordered by effort vs trust gained.

### Tier 1 — implementable inside the course timeline (low effort, high pedagogical value)

1. **`refundAfterDeadline` in `IntentEscrow`.** Any caller can refund a deposit whose intent has expired and which is not `Settled`. Removes the worst load-bearing trust assumption (§3-D).
2. **Sign the quoted destination into the intent.** Add `selectedDestinationChainId` and a router signature to the deposit struct, so the relayer is bound by the user's signed selection, not by mutable router state (§3-C).
3. **Multi-router cross-check.** Run the router twice with two independent random seeds for the adapter; flag intents where the two quotes disagree by more than X%. This is a 30-line change and demonstrates the "multiple independent observers" mitigation pattern (§3-A, §3-B).
4. **Document the existing safety property prominently.** The escrow can only refund to the depositor — never redirect. This is a real strong point of the current design; surface it in the demo and slides.

### Tier 2 — natural extensions, beyond MVP

5. **Replace `onlyOwner` with a small multisig.** Off-the-shelf with `safe-contracts` or a minimal threshold scheme. Closes the centralisation worst case (§4) without changing the protocol.
6. **Commit-reveal on intent submission.** User commits `hash(intent, salt)`; router quotes; user reveals to the relayer. Removes the router's MEV power (§4.2).
7. **Relayer bonding.** Relayers post bond; on-chain dispute can slash for non-fill or wrong-destination fill. Mirrors Across.

### Tier 3 — research-grade

8. **Open the router into an auction.** Multiple routers submit signed quotes; cheapest-wins or batch-auction (CoW-style). Removes the structural chokepoint (§4.1).
9. **TEE or zk attestation over the adapter probe.** Independent verifiers can challenge an adapter that reports false congestion. Hardest, but the cleanest answer to §3-B.

---

## 7. What we are *not* claiming

- We are **not** claiming the prototype is production-safe. It is not.
- We are **not** claiming our routing is censorship-resistant. It is not — a hostile operator could trivially refuse to quote.
- We are **not** claiming the centralisation risks of §4 are unique to our design. They are inherent to **any** off-chain intent router and are the active research frontier of production intent protocols (see §5).
- We **are** claiming that (i) the trust assumptions are fully enumerated, (ii) the existing escrow design contains the failure modes to "fund stuck" rather than "fund stolen," and (iii) the roadmap from §6 is concrete and follows established industry mitigations.

---

## 8. One-paragraph summary for the demo / slides

> IntentRoute pays a real decentralisation cost — one router, one relayer, one `onlyOwner` settlement key — to buy user-access scalability across heterogeneous rollups. The escrow design contains the worst failures to **stalled funds, not stolen funds**: even a fully malicious settlement owner cannot redirect a deposit away from its depositor. The principal load-bearing trust assumption is the absence of a permissionless refund path, which we address with a one-line `refundAfterDeadline`. Routing-specific risks — MEV, censorship, and policy capture — match the open research questions facing Across, CoW, 1inch Fusion+, and NEAR Intents, and we document a tier-by-tier mitigation roadmap that follows their solutions: signed intents, multisig settlement, commit-reveal mempools, and ultimately solver auctions with on-chain verification.

---

## 9. Cross-references

- Empirical scalability evidence: [scalability_analysis.md](scalability_analysis.md)
- Requirements and lifecycle: [option6_requirements_plan.md](option6_requirements_plan.md)
- Remaining work: [../myfiles/待办事项.md](../myfiles/待办事项.md)
- Escrow implementation: [../contracts/src/IntentEscrow.sol](../contracts/src/IntentEscrow.sol)
- Settlement registry implementation: [../contracts/src/SettlementRegistry.sol](../contracts/src/SettlementRegistry.sol)
- Router and policy weights: [../backend/lib/router.mjs](../backend/lib/router.mjs)
- Environment adapter (data source under attack in §3-B): [../backend/lib/environments.mjs](../backend/lib/environments.mjs)
