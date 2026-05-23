# IntentRoute

IntentRoute is a course-project scaffold for `Option 6: Cross-Rollup Intent Router for Scalable User Transactions`.

This repository currently contains:

- a zero-dependency Node backend with an explainable routing engine;
- a static frontend for intent creation, route comparison, and execution tracking;
- a Foundry smart-contract workspace for escrow and settlement state;
- a benchmark runner for comparing routing policies.

## Repository Layout

```text
backend/       API server, environment adapters, router, and simulator
contracts/     Foundry contracts and tests
data/          benchmark outputs and sample metrics
docs/          requirements and planning documents
experiments/   repeatable benchmark runner
frontend/      static UI served by the backend
```

## Quick Start

### 1. Start the backend and frontend

```bash
npm run dev
```

Then open [http://localhost:3100](http://localhost:3100).

### 2. Generate benchmark outputs

```bash
npm run benchmark:sample
```

This now generates three outputs:

- `data/benchmark-sample.json` for the frontend summary card;
- `data/benchmark-expanded.json` for the full experiment matrix;
- `data/benchmark-report.md` for a report-ready markdown summary.

### 3. Compile contracts

```bash
npm run forge:build
```

### 4. Run contract tests

```bash
npm run forge:test
```

The wrapper script resolves a local `solc 0.7.4` binary from `LOCAL_SOLC_PATH` or `~/.solc-select/artifacts/solc-0.7.4/solc-0.7.4`.

## Current MVP

The first scaffold focuses on:

- transfer-style intents;
- three simulated destination environments;
- deterministic routing based on fee, latency, congestion, and reliability;
- explainable route selection;
- simulated relayer lifecycle events;
- a multi-scenario benchmark suite with dynamic and static routing baselines.

## Immediate Next Steps

- wire the backend simulator to local Anvil chains;
- add deployment scripts for the contracts;
- connect frontend submission to real contract calls;
- add visual charts for the full benchmark matrix inside the frontend;
- compare simulated routing against real contract-backed execution traces.
