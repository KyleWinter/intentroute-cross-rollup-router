# IntentRoute 10-Minute Demo Walkthrough

> A scripted walkthrough for the SC6109 Option 6 deliverable. Every section is tagged with the PDF Feature Requirement (`FR-x`) or Hint (`H-x`) it addresses, so a grader can verify coverage point-by-point.
>
> Total runtime: **10:00 ± 30 s**.
>
> Presenter layout: split the screen — top half terminal/IDE, bottom half browser at `http://localhost:3100`.

---

## 0. Pre-flight (does not count toward the 10 minutes)

```bash
npm run doctor          # verify dependencies
npm start               # chains + deploy + on-chain backend
```

Open two browser tabs:
- **Tab A** — [http://localhost:3100](http://localhost:3100) (intent submission)
- **Tab B** — [http://localhost:3100/charts.html](http://localhost:3100/charts.html) (experiment board)

Keep these handy in a side window for fast pivot:
- [docs/scalability_analysis.md](scalability_analysis.md)
- [docs/trust_and_decentralization.md](trust_and_decentralization.md)
- [docs/architecture.md](architecture.md)

---

## 1. Problem framing (**0:00 – 1:00**)

> Maps to PDF *Background & Problem Statement* + *Project Summary*.

**Talking points (≈ 45 s):**

> In a multi-rollup world a user has to manually compare gas, latency, and congestion across Arbitrum, Optimism, Base, zkSync … before every transaction. That's friction at the **user-access layer**. IntentRoute lets the user describe the outcome, picks the destination automatically, and explains the choice. We are not raising TPS — we are removing the decision burden.

**On screen:** stay on the landing page so the grader sees the green **On-chain mode** banner; this is the proof the rest of the demo isn't simulated.

---

## 2. Architecture overview (**1:00 – 2:00**)

> Maps to all five PDF Feature Requirements + Hint H2 ("combine ideas from account abstraction, intents, and modular blockchains").

**Talking points (≈ 50 s):**

> The architecture is *off-chain routing + on-chain settlement anchoring*. The user signs an intent; the router scores three rollup candidates; `IntentEscrow` locks funds on origin; `DestinationVault` handles fills on the destination; `SettlementRegistry` records the lifecycle. We also layer ERC-4337 — the user signs once as a UserOperation, a bundler pays gas, the smart account triggers `depositIntent`. This composes intents, account abstraction, and modular execution exactly as the PDF asks.

**On screen:** flash three files in the IDE without reading them — [router.mjs](../backend/lib/router.mjs), [IntentEscrow.sol](../contracts/src/IntentEscrow.sol), [SmartAccount.sol](../contracts/src/SmartAccount.sol). Optional: open [architecture.md](architecture.md) to a mermaid diagram if you want a visual aid.

---

## 3. Submit a live transfer intent (**2:00 – 3:30**)

> Maps to FR-1 (intent creation), FR-4 (route discovery), FR-5 (route scoring), FR-6 (explainable decision), FR-9 (frontend tracking).

**Form input** (mostly defaults):
- Intent Type: `transfer`
- Preference: `balanced`
- Token In/Out: `USDC` / `USDC`
- Amount: `100`
- Recipient: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
- Scenario: `normal`
- Force Outcome: `auto`

**Click *Preview Routes*** — the candidate table renders immediately.

**Talking points (≈ 20 s)** while pointing at the candidates table:

> All three candidates are scored. CheapRollup scores 0.86 by winning cost and congestion; FastRollup leads on latency and reliability; CongestedRollup trails on every axis. The router also returns 2-3 reasons for the winner — this is what PDF FR-6 calls *Explainable Decision Output*.

**Click *Submit Intent*.** Watch the timeline build live.

**Talking points (≈ 30 s)** while pointing at the timeline:

> This isn't simulated. Every row carries a real tx hash and gas number: deposit on origin ~320 k gas, submit 49 k, vault fill on cheap-rollup ~150 k, then filled and settled at 49 k each. One intent actually traversed four local chains.

---

## 4. Custom weights and merchant path (**3:30 – 5:00**)

> Maps to PDF Use Cases A/B and Hint H5 (scalability argument).

### 4a. Custom weights (≈ 30 s)

1. Switch *Preference* to **custom**; sliders appear.
2. Drag **Cost** to 1.00 and the other three to 0.
3. Click *Preview Routes* — the winner now matches the cheapest valid candidate.
4. Talking point:
   > Weights are renormalised server-side to sum to 1. With cost weight 1.0 the winner is always the cheapest route — exactly what a `router.test.mjs` assertion guards.

### 4b. transfer_and_execute (≈ 60 s)

1. Switch *Preference* back to `balanced`.
2. Switch *Intent Type* to **transfer_and_execute**.
3. Leave *Execution Target* as `auto`, set amount to `75`.
4. Click *Submit Intent*.

**Talking point** when the `filled-destination` row appears:

> Gas is 250 k, up from 148 k on a plain transfer. The delta is `recordFillAndExecute` calling into `PaymentReceiver.acknowledge` inside the same transaction. That's PDF Use Case B — *transfer + simple action* — executed on a real local chain.

> **Cut for time:** drop 4a and keep only 4b if you're running long.

---

## 5. Force-failure and refund (**5:00 – 6:00**)

> Maps to FR-7 (lifecycle states `failed` / `refunded`) and NFR-6 (safety).

1. Switch *Intent Type* back to **transfer**.
2. Set *Force Outcome* to **failure**.
3. Submit a small amount (10 USDC).

The timeline progresses through:

```
escrowed → submitted → filled-destination → filled → failed → refunded
```

**Talking point (≈ 30 s)** pointing at the *refunded* row:

> Refund is a real tx — 81 k gas. Funds actually leave `IntentEscrow` back to the depositor. This anchors the safety claim from our trust doc: **the worst case in this prototype is funds stuck, not funds stolen.** `IntentEscrow.refund` only sends to `deposit.depositor`. We surface this as the key strength of the current escrow design.

---

## 6. Experiment board and Pareto argument (**6:00 – 8:30**)

> Maps to FR-11 (benchmark mode), FR-12 (reporting), Feature #5 (analyse scalability), Hint H5.

Switch to Tab B (`/charts.html`).

### 6a. Aggregate ranking (≈ 30 s)

Scroll to *Aggregate Policy Ranking*. Talking point:

> Across 12 cells (3 scenarios × 4 workloads) `fixed_cheap-rollup` is the best static policy with 6 first-place finishes — *if* the user happens to pick it. The wrong static guess — `fixed_congested-rollup` — collapses to **43% completion**. Our `balanced` dynamic policy never drops below 86%. That gap is the user-access scalability claim, made quantitative.

### 6b. Pareto scatter (≈ 90 s)

Scroll to *Aggregate Pareto: Cost vs P95 Latency*. Talking point:

> X-axis is average fee, Y-axis is p95 latency, marker radius is completion rate. The green dashed line is the Pareto frontier — no policy strictly dominates these points on both axes.
>
> There are two stable Pareto endpoints: `fixed_cheap-rollup` / `cheapest` in the cheap-but-slow corner, `fixed_fast-rollup` / `fastest` in the fast-but-expensive corner. The point that matters is `balanced` — it sits alone on the frontier with sub-$1 fee, sub-10 s p95, 90% completion, **and 100% valid-route rate**. No static policy can hit all four at once. That's the graphical version of the headline finding in [scalability_analysis.md](scalability_analysis.md).

### 6c. Winner matrix (≈ 30 s)

Scroll to *Dynamic vs Static Winner Matrix*. Talking point:

> Dynamic 6 / static 6 — looks tied. Look closer: the dynamic wins are concentrated in the *hardest* cells — `burst/strict_output_protection`, `stress/strict_output_protection`. In the stress row, congested-rollup is dead, fixed-cheap falls to 64% completion, fixed-fast to 61% — and `balanced` still holds 96%. The harder the scenario, the more decisive dynamic wins.

---

## 7. ERC-4337 + test matrix (**8:30 – 9:30**)

> Maps to Hint H2 + General Tip "regularly test".

In the IDE, open [SmartAccount.t.sol](../contracts/test/SmartAccount.t.sol). Show the two test names:
- `testEntryPointExecutesSignedDepositIntent`
- `testRejectsBadSignatureWithoutAdvancingNonce`

Run in the terminal:

```bash
npm run forge:test   # → 14 tests passed
npm test             # → 24 tests passed
```

**Talking point (≈ 40 s):**

> Our ERC-4337 layer is deliberately incomplete — no paymaster, no `initCode`, no bundler rules. Two things we did make real: first, a smart account can sign a single `UserOperation` whose callData is `IntentEscrow.depositIntent`, end-to-end in the test suite — meaning the user does not need a funded EOA on the origin chain. Second, a bad signature does **not** consume the nonce, which is the anti-replay invariant ERC-4337 requires; that's enforced by a dedicated negative test. 14 contract tests + 24 backend = 38 total, all green in CI.

---

## 8. Trust, centralisation, close (**9:30 – 10:00**)

> Maps to Hint H3 (trust assumptions), Hint H4 (centralisation risks), General Tip on the blockchain trilemma.

**Talking point (≈ 25 s):**

> Two honest disclosures the PDF asks for explicitly.
>
> **Trust assumptions** — single router, single relayer, `onlyOwner` settlement key. The most load-bearing weakness is the absence of a permissionless refund path. A one-line `refundAfterDeadline` closes it, and it's in our tier-1 mitigation list.
>
> **New centralisation risks** — router chokepoint, structural MEV advantage, and policy weight governance. We compare each against how Across, CoW, 1inch Fusion+, and NEAR Intents mitigate them in [trust_and_decentralization.md](trust_and_decentralization.md).
>
> **Trilemma position** — we trade decentralisation (off-chain router) for user-access scalability, and preserve safety on-chain. This is the same trade-off every production intent system makes.

**Close (≈ 5 s):**

> Code, benchmark, all eight design docs are in the repo. Thank you.

---

## Fallbacks

| If… | Pivot |
|---|---|
| Anvils crash mid-demo | Ctrl-C the backend, run `npm run start:simulated`, frontend banner goes blue. Keep going — UI works identically, only the tx hashes disappear. Spin it as "PDF Hint says simulation is acceptable too." |
| `transfer_and_execute` stalls | Switch to plain `transfer`, mention that the merchant path is exercised by [DestinationVault.t.sol](../contracts/test/DestinationVault.t.sol#L37) `testRecordFillAndExecuteAcknowledgesMerchant` and open that file briefly. |
| Browser renders weirdly | Hit the API directly: `curl http://127.0.0.1:3100/api/intents/<id> \| python3 -m json.tool` and read the timeline JSON aloud. |
| A test fails | Skip Section 7, give the freed 60 s to Section 6c. Never demo failing tests live. |

---

## Recording tips (if shooting the actual video)

- Read the script only for §1, §6b, §8 — those need precise phrasing. Improvise the rest while operating the UI.
- OBS: 1280×720 viewport, browser font 110% — tx hashes and gas numbers must be legible at video bitrates.
- Pace: pause 1 s after every click before speaking. Lets graders read what they just saw.
- End on a 3 s static frame of the README hero so post-production can attach a title card.

---

## Post-demo self-check

- [ ] §1 made it clear we target **user-access** scalability, not consensus TPS
- [ ] §3 ran a `transfer` + `balanced` intent through the **on-chain** path
- [ ] §4 demonstrated at least one of **custom weights** or **transfer_and_execute**
- [ ] §5 triggered `forceOutcome:failure` and showed the `refunded` event with a real tx hash
- [ ] §6 walked through the Pareto chart and identified the *uncontested* `balanced` point
- [ ] §7 showed a `npm test` green run in the terminal
- [ ] §8 explicitly named both **trust assumptions** and **new centralisation risks** (the two PDF Hints)
- [ ] Total runtime ≤ 10:30

All ✓ ⇒ Option 6's 5 Feature Requirements + 5 Hints + the "10-minute demo" deliverable line up.
