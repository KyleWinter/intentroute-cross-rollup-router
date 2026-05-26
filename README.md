# IntentRoute

> An explainable cross-rollup intent router for **SC6109 Option 6: Cross-Rollup Intent Router for Scalable User Transactions**.

A user describes the outcome they want; IntentRoute selects the best destination rollup based on fee, latency, congestion, and predicted success rate, then anchors the lifecycle on-chain. The same prototype runs in two modes:

- **Simulated mode** — a single Node process with zero dependencies. Useful for benchmarks and quick demos.
- **On-chain mode** — four local Anvil chains, real `IntentEscrow` / `DestinationVault` / `SettlementRegistry` contracts, real tx hashes and gas accounting.

A minimal ERC-4337 smart-account layer ([`SmartAccount.sol`](contracts/src/SmartAccount.sol) + [`IntentEntryPoint.sol`](contracts/src/IntentEntryPoint.sol)) demonstrates how account abstraction composes with intent routing.

中文版：[README.zh.md](README.zh.md)

---

## Features

- **Outcome-based intent submission** — `transfer`, `transfer_and_execute`, `swap` (mock AMM with per-environment price + depth)
- **Multi-factor router** with four presets (`balanced`, `cheapest`, `fastest`, `reliable`) and a `custom` preset driven by user-supplied weights
- **Three simulated rollup environments** (FastRollup / CheapRollup / CongestedRollup) with seeded scenario shocks (`normal`, `burst`, `stress`)
- **On-chain settlement** — `IntentEscrow`, `SettlementRegistry`, `DestinationVault` (with `recordFillAndExecute` for the merchant path), `PaymentReceiver`
- **ERC-4337 smart account** — ECDSA owner, chainId-bound `userOpHash`, replay-safe nonce, batched `handleOps`
- **Explainable route decisions** — every selected route returns 2-3 reasons and a per-factor utility breakdown
- **Force-outcome control** — `forceOutcome: auto | success | failure` lets the demo deterministically exercise the refund path
- **Benchmark matrix** — 3 scenarios × 4 workloads × 7 policies, with a markdown report, JSON snapshots, and a frontend experiment board
- **Aggregate Pareto chart** — cost vs p95 latency scatter with frontier highlighting
- **CI** — GitHub Actions runs backend tests, benchmark reproducibility, and Foundry tests

---

## Repository Layout

```text
backend/                Node HTTP server, router, simulator, on-chain client
  lib/
    intent-schema.mjs   intent validation, custom weights, force outcome
    router.mjs          weighted multi-factor scoring, explanations
    environments.mjs    three rollup profiles + scenario / swap pricing
    simulator.mjs       dispatcher (in-memory vs on-chain)
    onchain-simulator.mjs  real-chain lifecycle (cast subprocess + queue)
    chain-client.mjs    zero-dep JSON-RPC wrapper
    store.mjs           in-memory intent record store
contracts/              Foundry workspace (solc 0.7.4)
  src/
    IntentEscrow.sol           source-chain escrow
    SettlementRegistry.sol     global lifecycle registry
    DestinationVault.sol       fill + transfer_and_execute
    PaymentReceiver.sol        merchant-style execution target
    MockERC20.sol              test tokens
    SmartAccount.sol           ERC-4337-style account
    IntentEntryPoint.sol       minimal EntryPoint
  test/                14 Foundry tests across 4 suites (escrow, vault, registry, smart account)
data/                   benchmark outputs + deployment addresses + anvil logs + downloaded solc
docs/                   analysis and design documents (see below)
experiments/run-benchmark.mjs   reproducible benchmark runner
frontend/               static HTML/CSS/JS served by the backend
scripts/
  run-all.sh            one-click launcher with doctor + auto-install-solc
  start-chains.sh       launch four Anvil chains (8545-8548 / chainIds 9000-9103)
  stop-chains.sh        stop them
  deploy.mjs            forge create + cast wiring, writes data/deployments.json
  run-tests.mjs         backend unit-test runner
  forge-local.mjs       wraps forge build/test with a local solc 0.7.4
.github/workflows/ci.yml  three-job CI
```

---

## Quick Start

Requirements:
- **Node.js ≥ 18** — required for everything
- **[Foundry](https://book.getfoundry.sh/)** — required only for on-chain mode
- **solc 0.7.4** — required for on-chain mode; the launcher can download it for you

### One-line bootstrap

```bash
npm run doctor          # check dependencies, get install hints for whatever's missing
npm run install-solc    # auto-download solc 0.7.4 if you don't already have it
npm start               # bring up chains + deploy contracts + start backend in on-chain mode
npm stop                # tear everything down (chains + backend)
```

[scripts/run-all.sh](scripts/run-all.sh) is idempotent: re-running `npm start` will skip whatever's already up (anvils, contracts) and only do the missing work. Contract addresses are deterministic, so the same `data/deployments.json` keeps working across restarts as long as the chains aren't reset.

### npm scripts reference

| Script | Purpose |
|---|---|
| `npm start` | One-click on-chain mode (chains + deploy + backend) |
| `npm run start:simulated` | Backend only, no Foundry / no solc |
| `npm stop` | Tear down chains and backend |
| `npm run doctor` | Dependency health check |
| `npm run install-solc` | Auto-download solc 0.7.4 to `data/solc/` |
| `npm test` | Backend unit tests (24) |
| `npm run forge:test` | Foundry contract tests (14) |
| `npm run benchmark` / `:sample` | Run the 12-cell benchmark matrix (`:sample` also writes JSON + markdown) |
| `npm run chains:start` / `:stop` / `:deploy` | Manual control over the on-chain stack |

### Simulated mode (no Foundry / no solc needed)

```bash
npm run start:simulated
# or: npm run dev
# open http://localhost:3100
```

The frontend exposes intent submission, route preview, lifecycle timeline, and the experiment board. The benchmark snapshot is already committed under `data/`.

### On-chain mode (four local Anvils)

The recommended path is `npm start`, which handles everything below for you. The manual steps remain available for transparency and debugging:

```bash
npm run chains:start            # 4 anvils on 8545-8548, chainIds 9000-9103
npm run chains:deploy           # forge create on each, writes data/deployments.json
ONCHAIN_MODE=1 npm run dev      # backend talks to the chains via cast subprocess
npm run chains:stop             # tear the anvils down
```

In on-chain mode the frontend's mode banner switches to green and the lifecycle timeline carries real tx hashes, chain badges, and gas usage. Typical lifecycle gas: deposit ~320k → submit/fill/settle 49k each, vault fill ~150k (or ~250k for `transfer_and_execute`).

### Demo

See [docs/demo_walkthrough.md](docs/demo_walkthrough.md) for a precise 10-minute walkthrough mapped to each Option 6 Feature Requirement and Hint from the PDF spec.

### Benchmark

```bash
npm run benchmark           # prints to stdout
npm run benchmark:sample    # also writes JSON + markdown report
```

Outputs:
- `data/benchmark-sample.json` — featured experiment for the summary card
- `data/benchmark-expanded.json` — full 12-cell matrix used by the experiment board
- `data/benchmark-report.md` — markdown report cited by the analysis doc

### Tests

```bash
npm test               # 24 backend unit tests
npm run forge:test     # 14 Foundry tests — auto-resolves solc 0.7.4
```

The benchmark + both test suites are wired into CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) and run on every push.

---

## Documentation

The reasoning behind the project lives in `docs/` and is the primary deliverable along with the code:

- [architecture.md](docs/architecture.md) — system components, lifecycle sequences, trust surface (8 mermaid diagrams)
- [option6_requirements_plan.md](docs/option6_requirements_plan.md) — original requirements analysis and project plan
- [scalability_analysis.md](docs/scalability_analysis.md) — the empirical scalability claim, methodology, and four answered research questions
- [trust_and_decentralization.md](docs/trust_and_decentralization.md) — five-actor trust model, six categorised assumptions, and a three-tier mitigation roadmap
- [privacy_tradeoffs.md](docs/privacy_tradeoffs.md) — what the system leaks today, MEV / timing risks, four mitigation families with named references
- [erc4337_integration.md](docs/erc4337_integration.md) — why account abstraction and intents compose, what was shipped, what was deliberately omitted
- [erc7683_mapping.md](docs/erc7683_mapping.md) — field-by-field mapping from our schema to the draft ERC-7683 cross-chain intent standard
- [testnet_deployment.md](docs/testnet_deployment.md) — how to point the same scripts at Sepolia / Optimism Sepolia / Base Sepolia / Arbitrum Sepolia
- [demo_walkthrough.md](docs/demo_walkthrough.md) — 10-minute demo script, every section tagged with its PDF Feature Requirement / Hint

---

## Architecture (one paragraph)

A user signs an outcome-shaped intent. An off-chain router scores three candidate rollup environments on cost, latency, congestion, and reliability — using either a preset preference or user-defined weights — and returns an explainable selection. Funds are locked in `IntentEscrow` on the origin chain. A relayer drives the lifecycle: `markSubmitted`, then a destination-side `DestinationVault.recordFill` (or `recordFillAndExecute` for the merchant path, which calls into `PaymentReceiver`), then `markFilled` and `markSettled` (or `markFailed` + `refund`). Every transition is mirrored into `SettlementRegistry` so the frontend can observe the full history. With ERC-4337 enabled, the user signs a `UserOperation` whose `callData` is `IntentEscrow.depositIntent`; a bundler submits and pays gas via `IntentEntryPoint.handleOps`.

---

## What this project does **not** claim

- It does not raise base-chain TPS. The scalability claim is **user-access**: keeping per-user UX stable as the rollup ecosystem fragments.
- It is not production-secure. The settlement owner is a single key; an `onlyOwner` refund is the principal load-bearing trust assumption (documented and given a mitigation in [trust_and_decentralization.md](docs/trust_and_decentralization.md)).
- It does not integrate live testnets. Three simulated environments and four local Anvils stand in.
- It is not ERC-4337 spec-complete (no paymaster, no `initCode`, no bundler validation rules) — but the integration is real enough to authorise an actual `depositIntent` from a smart account, end-to-end, in the test suite.

---

## Course Information

- SC6109 (NTU), Option 6
- Submission deadline: 2026-05-31 23:59
- Group: up to 5 students, single submission per group
