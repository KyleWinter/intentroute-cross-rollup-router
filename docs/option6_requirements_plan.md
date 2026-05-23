# Option 6 Requirements And Project Plan

## 1. Context And Assumptions

### Course Constraints

- Course project weight: 50% of the course.
- Group size: up to 5 students.
- Submission deadline: `May 31, 2026 23:59`.
- Submission package: source code, a 10-minute demo video, and presentation slides.
- Only one group member needs to submit.

### Option 6 Brief

`Option 6: Cross-Rollup Intent Router for Scalable User Transactions`

The project brief requires:

- an intent interface for users to specify desired outcomes;
- a routing layer that selects between at least two execution environments;
- routing criteria such as cost, latency, congestion, or success probability;
- a frontend showing route selection and execution status;
- an analysis explaining how the design improves user scalability and system efficiency.

### Important Assumption

No separate grading rubric was found in the provided local materials. This plan therefore optimizes for the grading signals that are clearly implied by the brief and deliverables:

- topic fit with blockchain scalability;
- implementation completeness;
- technical depth in routing and execution logic;
- empirical evaluation;
- demo clarity;
- presentation quality and engineering discipline.

## 2. Recommended Project Definition

### Working Title

`IntentRoute: An Explainable Cross-Rollup Intent Router`

### One-Sentence Positioning

Users specify the outcome they want, and the system automatically chooses the best rollup-like execution environment based on measurable criteria such as fee, latency, congestion, and success probability.

### Recommended Scope

Build a prototype with:

- a web frontend for submitting intents and viewing route decisions;
- an off-chain routing service;
- `3` local EVM execution environments that simulate different rollup conditions;
- lightweight smart contracts for intent escrow, fill recording, and settlement status;
- a relayer or solver simulator;
- a metrics dashboard and experiment runner.

### Why This Scope

This scope is intentionally chosen because it:

- matches the project brief exactly;
- keeps real blockchain components in the loop;
- avoids the high integration risk of connecting many live rollups;
- still allows a rigorous scalability argument through controlled experiments;
- produces a strong 10-minute demo.

## 3. Product Vision

### Problem Statement

In a multi-rollup ecosystem, users should not need to manually inspect gas fees, latency, liquidity, or congestion before deciding where to transact. This manual chain selection hurts usability and creates scalability friction at the user-access layer.

### Proposed Solution

The system accepts a high-level intent such as:

- "Send 100 USDC to Bob on the destination environment."
- "Swap 1 ETH for at least 3000 USDC and deliver it on the best destination environment."

It then:

- collects route candidates from multiple execution environments;
- scores the candidates using a deterministic routing policy;
- chooses the best route;
- executes the transaction through a relayer or solver flow;
- shows the user why the route was chosen.

### Scalability Claim

The project does not claim to increase raw consensus throughput. Instead, it argues that user-facing scalability improves when:

- users do not need to manually choose among fragmented execution environments;
- order flow is dynamically routed to less congested destinations;
- the system reduces failed transactions and poor chain-selection decisions;
- execution environments are utilized more efficiently.

## 4. Stakeholders And Personas

### Primary Users

- retail users who want simple cross-rollup payments or swaps;
- application developers who want a unified transaction entry point;
- researchers or instructors evaluating scalability trade-offs.

### Internal Stakeholders

- frontend developer;
- smart contract developer;
- backend or routing developer;
- experiment or evaluation owner;
- presentation and demo owner.

## 5. Project Scope

### In Scope

- intent submission UI;
- support for at least `2` execution environments, with `3` recommended;
- route selection using measurable criteria;
- smart-contract-backed intent lifecycle;
- relayer or solver simulation;
- execution status tracking;
- experiment dashboard;
- comparative evaluation against baselines.

### Out Of Scope

- production-grade bridge security;
- integration with many live rollups;
- real decentralized solver auctions;
- full ERC-7683 compliance;
- formal verification;
- production-ready economic security.

## 6. Chosen Use Cases

### MVP Use Case A: Cross-Rollup Token Transfer

User intent:

- "Transfer `X` amount of mock USDC from source environment to recipient on the best destination environment."

Why it is good:

- simple to explain;
- enough to demonstrate routing;
- easy to benchmark;
- low contract complexity.

### MVP Use Case B: Transfer Plus Simple Action

User intent:

- "Transfer USDC to destination environment and then pay a merchant or deposit to a target contract."

Why it is useful:

- shows that the router is selecting not just a chain, but an execution path;
- aligns with intent systems such as transfer plus execution.

### Stretch Use Case C: Cross-Rollup Swap

User intent:

- "Swap ETH for USDC and deliver to the best destination environment."

This is a stretch goal because it adds pricing, slippage, and settlement complexity.

## 7. Functional Requirements

### FR-1 Intent Creation

The system shall allow a user to create a structured intent containing:

- source environment;
- optional preferred destination or destination policy;
- token in;
- token out;
- amount in;
- minimum amount out if relevant;
- recipient;
- priority preference such as cheapest, fastest, or balanced;
- expiration deadline.

### FR-2 Intent Validation

The system shall validate all intent fields before submission and reject malformed or unsupported requests.

### FR-3 Intent Escrow

The source-side smart contract shall receive user funds or record a mock asset lock so the execution flow has a blockchain anchor.

### FR-4 Route Discovery

The backend shall query all configured execution environments and generate route candidates.

### FR-5 Route Scoring

The router shall score route candidates using at least these criteria:

- estimated fee;
- estimated latency;
- congestion level;
- success probability.

### FR-6 Explainable Decision Output

The router shall return not only the selected route but also an explanation of why it was selected, including per-factor scores.

### FR-7 Execution

The system shall execute the chosen route using a relayer or solver simulator and record status transitions such as:

- created;
- quoted;
- selected;
- submitted;
- filled;
- settled;
- failed.

### FR-8 Multi-Environment Support

The system shall support at least `2` execution environments. The recommended target is `3`:

- `FastRollup`;
- `CheapRollup`;
- `CongestedRollup`.

### FR-9 Frontend Tracking

The frontend shall show:

- submitted intent;
- candidate routes;
- selected route;
- current execution status;
- final outcome.

### FR-10 Metrics Collection

The system shall store execution metrics for each run, including:

- estimated fee;
- actual fee;
- end-to-end latency;
- success or failure;
- destination selected;
- route score;
- reason code for failure if any.

### FR-11 Benchmark Mode

The system shall support replayable workloads for comparing:

- static routing to one environment;
- cheapest-only routing;
- latency-only routing;
- weighted multi-factor routing.

### FR-12 Reporting

The system shall provide charts or tables showing:

- cost versus latency trade-offs;
- success rate under varying congestion;
- distribution of order flow across environments;
- comparison against baselines.

## 8. Non-Functional Requirements

### NFR-1 Clarity

The system shall expose route explanations that a non-expert can understand during the demo.

### NFR-2 Repeatability

Experimental runs shall be reproducible using seeded workloads and fixed environment profiles.

### NFR-3 Modularity

Routing logic, environment adapters, contracts, and UI shall be separated so the team can work in parallel.

### NFR-4 Observability

The system shall log each lifecycle event and preserve enough data for debugging failed routes.

### NFR-5 Performance

The demo system should return route selection quickly, ideally within `1` second for simulated workloads.

### NFR-6 Safety

Expired intents, unsupported assets, and impossible routes shall fail gracefully rather than leaving the system in an ambiguous state.

### NFR-7 Usability

A first-time user should be able to submit and understand a route decision without reading technical documentation.

## 9. System Architecture

### Component Overview

#### A. Frontend

- React or Next.js UI
- intent creation form
- route comparison panel
- execution timeline
- charts dashboard

#### B. Router API

- receives user intents
- validates schema
- fetches environment data
- computes route scores
- returns ranked routes and explanation

#### C. Relayer Or Solver Simulator

- executes selected route
- simulates solver fill behavior
- updates status
- handles retry or fail paths

#### D. Smart Contracts

- `IntentEscrow.sol`
- `MockERC20.sol`
- `DestinationVault.sol` or `PaymentReceiver.sol`
- `SettlementRegistry.sol`

#### E. Environment Adapters

- one adapter per local rollup-like environment
- returns fee, latency, congestion, and liquidity information

#### F. Metrics And Benchmark Engine

- workload generator
- experiment runner
- results database or JSON store
- chart generator

### Recommended Architecture Pattern

Use an `off-chain routing + on-chain settlement anchor` pattern.

This mirrors real systems closely enough to be credible while staying deliverable within the project timeline.

## 10. Execution Environment Design

### Recommended Setup

Create `3` local EVM chains with Hardhat or Anvil:

- `FastRollup`
- `CheapRollup`
- `CongestedRollup`

### Suggested Profiles

#### FastRollup

- low latency
- higher fee
- high success probability

#### CheapRollup

- low fee
- medium latency
- medium to high success probability

#### CongestedRollup

- volatile fee
- high latency
- lower success probability during load spikes

### Why Three Environments

Two environments satisfy the brief, but three make the routing problem much clearer and produce stronger charts.

## 11. Intent And Data Model

### Intent Schema

```json
{
  "intentId": "uuid-or-hash",
  "intentType": "transfer|transfer_and_execute|swap",
  "sourceChainId": 1111,
  "tokenIn": "USDC",
  "tokenOut": "USDC",
  "amountIn": "100000000",
  "minAmountOut": "99500000",
  "recipient": "0xRecipient",
  "preference": "balanced",
  "deadline": 1780000000
}
```

### Route Candidate Schema

```json
{
  "routeId": "route-fastrollup-001",
  "destinationChainId": 2222,
  "estimatedFee": 0.84,
  "estimatedLatencyMs": 4200,
  "congestionScore": 0.22,
  "successProbability": 0.98,
  "expectedAmountOut": 99.7,
  "compositeScore": 0.81,
  "explanation": [
    "lowest expected latency",
    "high success probability",
    "slightly higher fee than cheapest alternative"
  ]
}
```

## 12. Routing Policy

### Baseline Policy

Weighted multi-factor score:

`score = w1 * cost_utility + w2 * latency_utility + w3 * reliability_utility + w4 * congestion_utility`

Where:

- lower cost maps to higher `cost_utility`;
- lower latency maps to higher `latency_utility`;
- lower congestion maps to higher `congestion_utility`;
- higher reliability maps to higher `reliability_utility`.

### Recommended Presets

- `Cheapest`: emphasize fee.
- `Fastest`: emphasize latency.
- `Balanced`: equal emphasis on fee, latency, and reliability.
- `Reliable`: emphasize success probability.

### Hard Constraints

Before scoring, reject routes that violate:

- unsupported asset pair;
- insufficient liquidity;
- user minimum output not met;
- expired deadline;
- predicted success probability below threshold.

### Explainability Requirement

Every selected route must include:

- rank among candidates;
- metric table;
- top `2` reasons for selection;
- note on trade-offs.

## 13. Smart Contract Responsibilities

### `MockERC20.sol`

- used for test tokens such as mock USDC and mock ETH.

### `IntentEscrow.sol`

- accepts deposits on the source chain;
- stores intent hash and sender data;
- marks escrow state;
- releases or refunds funds based on settlement outcome.

### `DestinationVault.sol`

- acts as destination-side liquidity sink or payout contract;
- records fills initiated by relayer.

### `SettlementRegistry.sol`

- records final intent states for traceability;
- allows status verification for frontend and experiments.

## 14. User Stories

### User Story 1

As a user, I want to submit a payment intent without manually choosing a rollup, so that I can avoid comparing chains myself.

### User Story 2

As a user, I want to see why a route was selected, so that I can trust the system's decision.

### User Story 3

As a relayer simulator, I want to fill valid intents and record outcomes, so that the system can demonstrate a realistic intent lifecycle.

### User Story 4

As a project evaluator, I want to compare routing policies under controlled workloads, so that I can understand the scalability argument.

## 15. Acceptance Criteria

The MVP is acceptable if all of the following are true:

- users can submit at least one intent type from the frontend;
- the backend evaluates at least `3` candidate environments;
- the router chooses a route based on at least `3` measurable criteria;
- a smart contract records the source-side escrow or intent registration;
- execution status is visible end-to-end in the UI;
- benchmark results compare the proposed router against at least `2` baselines;
- the final report explains how routing improves user-facing scalability.

## 16. Evaluation Plan

### Research Questions

- Does dynamic routing reduce average transaction cost compared with a fixed-chain baseline?
- Does dynamic routing reduce latency under congestion?
- Does dynamic routing improve success rate under bursty load?
- How often does the router choose a different environment than a naive policy?

### Baselines

- always use `FastRollup`;
- always use `CheapRollup`;
- choose lowest fee only;
- choose lowest latency only.

### Workloads

- low-load payment workload;
- bursty payment workload;
- mixed transfer plus execution workload;
- optional swap workload.

### Metrics

- average fee;
- p50 and p95 latency;
- success rate;
- failed transaction count;
- route diversity;
- user preference satisfaction.

### Expected Result Pattern

The target result is not that one route wins on every metric. The target result is:

- static routes are good only under narrow conditions;
- weighted routing provides the best overall balance;
- routing becomes more valuable as congestion heterogeneity increases.

## 17. Related Systems Research And Design Takeaways

### Across Protocol

Relevant lessons:

- user declares desired outcome instead of execution path;
- architecture is split into RFQ, relayer network, and settlement;
- lifecycle is initiation, fill, and settlement.

Design takeaway for this project:

- use a clear intent lifecycle and relayer-based execution model.

### NEAR Intents

Relevant lessons:

- users or AI agents express desired outcomes;
- solvers compete off-chain;
- a verifier contract settles the final transaction.

Design takeaway for this project:

- keep the routing and quote logic off-chain, but preserve an on-chain verification anchor.

### CoW Protocol

Relevant lessons:

- intents plus solver competition can improve execution quality;
- batching and auctions are central in more advanced systems.

Design takeaway for this project:

- although full solver auctions are out of scope, route competition should be explicit in the design.

### LI.FI

Relevant lessons:

- a dedicated aggregation and routing layer can query multiple liquidity sources and return the optimal route;
- architecture benefits from clean separation between UI, routing API, and on-chain execution.

Design takeaway for this project:

- structure the prototype around a modular routing service and environment adapters.

### 1inch Fusion+

Relevant lessons:

- intent-based cross-chain execution can be designed around maker and resolver roles;
- gas abstraction and recovery paths are valuable UX features.

Design takeaway for this project:

- include relayer responsibilities and at least one failure-handling path in the prototype.

## 18. Grading Alignment

### A. Topic Fit

This project directly targets blockchain scalability at the user-access and cross-rollup execution layer.

### B. Technical Depth

Depth comes from:

- route-scoring logic;
- relayer lifecycle;
- smart-contract-backed escrow;
- benchmarking methodology.

### C. Functionality

The MVP demonstrates:

- intent submission;
- route selection;
- execution;
- tracking;
- evaluation.

### D. Analysis

The project contains measurable experiments rather than only a working demo.

### E. Presentation Quality

The route explanation UI and benchmark charts will make the 10-minute video much easier to deliver convincingly.

## 19. MVP And Stretch Features

### MVP

- transfer intent only;
- `3` local environments;
- backend router with weighted scoring;
- source escrow contract;
- destination fill recording;
- metrics dashboard;
- benchmark comparison.

### Nice To Have

- transfer plus execution intent;
- user-selectable routing preference weights;
- failure recovery flow;
- optional swap intent;
- ERC-7683-inspired standardized intent fields.

### Avoid For This Course Timeline

- live bridge integration;
- production-grade decentralized auction network;
- too many chains;
- fancy AI routing with weak evaluation.

## 20. Suggested Team Split

### Member 1: Smart Contracts

- token contracts;
- escrow and settlement contracts;
- local chain deployment scripts;
- contract tests.

### Member 2: Backend And Routing

- intent schema;
- route scoring engine;
- relayer simulator;
- benchmark runner.

### Member 3: Frontend

- intent submission page;
- route explanation page;
- status timeline;
- charts integration.

### Member 4: DevOps And Data

- local multi-chain setup;
- metrics persistence;
- experiment automation;
- reproducibility scripts.

### Member 5: Evaluation And Presentation

- benchmark analysis;
- report writing;
- slide narrative;
- demo script and recording.

If the team has only `3` members, combine roles:

- contracts plus infra;
- backend plus experiments;
- frontend plus presentation.

## 21. Delivery Timeline

### Phase 1: `May 14-17, 2026`

- finalize requirements;
- decide exact MVP;
- set up repo, frontend, backend, and local chains;
- agree on intent schema and route metrics.

### Phase 2: `May 18-22, 2026`

- implement contracts;
- implement router and environment adapters;
- submit and track transfer intents end-to-end.

### Phase 3: `May 23-26, 2026`

- add benchmark runner;
- add charts and route explanation;
- implement one additional workload or one stretch feature.

### Phase 4: `May 27-29, 2026`

- run experiments;
- freeze metrics;
- polish UI and failure cases.

### Phase 5: `May 30-31, 2026`

- record demo video;
- finalize slides;
- clean repo and submission package.

## 22. Risks And Mitigations

### Risk 1: Scope Explosion

Mitigation:

- keep transfer intent as the required core;
- treat swap as optional.

### Risk 2: Multi-Chain Setup Consumes Too Much Time

Mitigation:

- use local EVM chains with identical deployment scripts;
- simulate environment differences in adapter data where necessary.

### Risk 3: Weak Scalability Argument

Mitigation:

- define baselines early;
- make experiments a first-class deliverable, not an afterthought.

### Risk 4: Demo Becomes Too Abstract

Mitigation:

- make route explanation visible in the UI;
- show side-by-side comparison with a naive fixed route.

## 23. Recommended Repository Structure

```text
project/
  docs/
    option6_requirements_plan.md
  contracts/
  scripts/
  backend/
  frontend/
  experiments/
  data/
  slides/
```

## 24. Final Recommendation

The strongest version of Option 6 for this course is:

`An explainable cross-rollup intent router with 3 local EVM execution environments, smart-contract-backed escrow, a relayer simulator, and a benchmark dashboard comparing dynamic routing against fixed and naive baselines.`

This version is:

- aligned with the brief;
- realistically implementable before `May 31, 2026`;
- strong enough for a convincing demo;
- rigorous enough for a course on blockchain privacy and scalability.

## 25. Sources

- [Across Docs: What are Crosschain Intents?](https://docs.across.to/guides/concepts/crosschain-intents)
- [Across Docs: Intent Architecture in Across](https://docs.across.to/guides/concepts/intents-architecture)
- [Across Docs: Intent Lifecycle in Across](https://docs.across.to/guides/concepts/intent-lifecycle)
- [NEAR Docs: NEAR Intents Overview](https://docs.near.org/chain-abstraction/intents/overview)
- [CoW Protocol Overview](https://cow.fi/cow-protocol)
- [OP Stack Devdocs](https://devdocs.optimism.io/)
- [LI.FI Architecture: System Overview](https://docs.li.fi/introduction/lifi-architecture/system-overview)
- [1inch Fusion+ Cross-Chain Swap Introduction](https://business.1inch.com/portal/documentation/apis/swap/cross-chain-swap/introduction)
