# GitHub Repository Draft

This document contains a ready-to-use draft for creating the GitHub repository for the SC6109 Option 6 course project.

## Recommended Repository Name

Primary recommendation:

`intentroute-cross-rollup-router`

Alternative options:

- `intentroute`
- `cross-rollup-intent-router`
- `sc6109-intentroute`
- `intentroute-scalability-project`

## Visibility Recommendation

Recommended default:

`Private`

Reason:

- safer for course submission and group collaboration
- avoids accidental exposure before the final report, slides, and demo are ready
- can be made public after submission if the team wants to showcase it

## GitHub "About" Section

### Repository Description

`Explainable cross-rollup intent router for scalable user transactions. SC6109 Option 6 course project.`

### Website

If you do not have a deployed site yet, leave this blank for now.

If you later deploy a demo page, you can add it here.

### Topics

Suggested topics:

- `blockchain`
- `rollup`
- `cross-rollup`
- `intents`
- `routing`
- `scalability`
- `smart-contracts`
- `foundry`
- `nodejs`
- `frontend`
- `course-project`

## Short Project Blurb

Use this when someone asks what the repository is about:

`IntentRoute is an explainable cross-rollup intent router that helps users express the outcome they want, while the system automatically selects the most suitable destination environment based on fee, latency, congestion, and execution reliability.`

## README Draft

You can use the following as the initial `README.md`.

```md
# IntentRoute

IntentRoute is an explainable cross-rollup intent router built for **SC6109 Option 6: Cross-Rollup Intent Router for Scalable User Transactions**.

The project allows a user to submit a high-level intent instead of manually choosing a chain. The router then evaluates multiple destination environments and selects the most suitable route based on cost, latency, congestion, and predicted execution reliability.

## Project Goal

The goal of this project is to study how **intent-based routing** can improve usability and scalability in a multi-rollup setting.

Instead of asking users to decide where to execute a transaction, IntentRoute lets them specify the result they want and delegates route selection to the system.

## Core Features

- Explainable intent routing across multiple rollup-like execution environments
- Support for transfer-style intents with route preview and submission flow
- Multi-factor route scoring using fee, latency, congestion, and success probability
- Simulated relayer lifecycle with timeline tracking
- Benchmark suite comparing dynamic routing policies against static baselines
- Frontend experiment board for presentation-ready visualizations
- Minimal smart contract layer for escrow and settlement tracking

## System Components

- `frontend/`
  - local simulator UI
  - experiment board UI
- `backend/`
  - API server
  - intent schema
  - routing logic
  - execution environment simulation
  - intent lifecycle store
- `contracts/`
  - `IntentEscrow`
  - `DestinationVault`
  - `SettlementRegistry`
  - `MockERC20`
- `experiments/`
  - benchmark runner
- `data/`
  - benchmark outputs and report artifacts

## Routing Policies

IntentRoute currently evaluates several policies:

- Dynamic: Balanced
- Dynamic: Cheapest
- Dynamic: Fastest
- Dynamic: Reliable
- Static: FastRollup
- Static: CheapRollup
- Static: CongestedRollup

## Execution Environments

The prototype models three rollup-like destination environments:

- `FastRollup`
  - speed-first profile with lower latency and higher fee
- `CheapRollup`
  - cost-first profile with lower fee and moderate latency
- `CongestedRollup`
  - degraded profile used as a stress-case baseline

## Demo Flow

1. The user creates an intent from the simulator page.
2. The router ranks candidate routes.
3. The selected destination is explained using route-level metrics.
4. A simulated relayer lifecycle shows how the intent progresses to settlement.
5. The experiment board visualizes benchmark results across different workloads and congestion scenarios.

## Benchmark Design

The benchmark compares dynamic and static routing strategies across:

- multiple congestion scenarios
- multiple workload types
- route validity
- completion rate
- actual fee
- actual latency
- p95 latency
- route distribution

## Local Development

### Start the backend

```bash
npm run dev
```

### Generate benchmark sample data

```bash
npm run benchmark:sample
```

### Open the simulator

Visit:

`http://127.0.0.1:3100/`

### Open the experiment board

Visit:

`http://127.0.0.1:3100/charts.html`

## Smart Contract Testing

```bash
npm run forge:test
```

## Project Context

This repository was developed as a course project for **SC6109 Blockchain Privacy & Scalability**.

Project option:

`Option 6: Cross-Rollup Intent Router for Scalable User Transactions`

## Team

Add your team members here before submission.

- Name 1
- Name 2
- Name 3
- Name 4
- Name 5

## Submission Artifacts

The final submission package includes:

- source code
- demo video
- presentation slides

## License

Choose one of the following depending on your preference:

- `MIT` if you want the repository to be open for reuse
- no license for now if you prefer to keep stricter control during the course
```

## Suggested First-Line README Version

If you want a slightly shorter opening paragraph, use this:

`IntentRoute is an explainable cross-rollup intent router that helps users express what outcome they want, while the system automatically chooses the most suitable destination environment across multiple rollup-like options.`

## Suggested GitHub Repository Subtitle For Presentation Or CV

`Course project on cross-rollup intent routing, explainable route selection, and scalability benchmarking.`

## Suggested Initial Release Tag

When you reach a stable demo milestone:

`v0.1-demo`

## Suggested Branch Naming

- `main`
- `feature/frontend-polish`
- `feature/contracts`
- `feature/benchmark`
- `docs/slides-and-report`

## Suggested Pinned Screenshot Captions

If you later upload screenshots into the README:

- `Simulator page for submitting and previewing intents`
- `Experiment board comparing dynamic and static routing policies`
- `Winner matrix across workload and congestion scenarios`

## Practical Notes

- If the repository is only for the course team and instructors, keep it private until submission is complete.
- If you want a cleaner public version later, you can publish after removing internal notes and polishing the README.
- If you create a public repository, prefer English for the README because it is easier for instructors and recruiters to scan quickly.
