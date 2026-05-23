import { clamp, round, seededUnitInterval } from "./utils.mjs";

export const ORIGIN_ENVIRONMENT = {
  id: "origin-hub",
  name: "OriginHub",
  chainId: 9000,
  role: "source"
};

export const DESTINATION_ENVIRONMENTS = [
  {
    id: "fast-rollup",
    name: "FastRollup",
    chainId: 9101,
    description: "Premium path with better latency and stronger reliability.",
    baseFeeUsd: 1.2,
    feeBps: 7,
    baseLatencyMs: 2100,
    baseCongestion: 0.24,
    baseSuccessProbability: 0.985,
    latencyPressure: 0.7,
    reliabilityPenalty: 0.06,
    spreadBps: 8
  },
  {
    id: "cheap-rollup",
    name: "CheapRollup",
    chainId: 9102,
    description: "Cost-optimized path with moderate latency and balanced reliability.",
    baseFeeUsd: 0.28,
    feeBps: 3,
    baseLatencyMs: 5200,
    baseCongestion: 0.34,
    baseSuccessProbability: 0.955,
    latencyPressure: 1.1,
    reliabilityPenalty: 0.1,
    spreadBps: 4
  },
  {
    id: "congested-rollup",
    name: "CongestedRollup",
    chainId: 9103,
    description: "High-variance path that becomes attractive only under specific load conditions.",
    baseFeeUsd: 0.52,
    feeBps: 4,
    baseLatencyMs: 7900,
    baseCongestion: 0.62,
    baseSuccessProbability: 0.9,
    latencyPressure: 1.35,
    reliabilityPenalty: 0.22,
    spreadBps: 6
  }
];

export function listEnvironments() {
  return {
    origin: ORIGIN_ENVIRONMENT,
    destinations: DESTINATION_ENVIRONMENTS.map((environment) => ({
      id: environment.id,
      name: environment.name,
      chainId: environment.chainId,
      description: environment.description
    }))
  };
}

export function buildRouteCandidates(intent, options = {}) {
  const scenario = options.scenario ?? "normal";
  return DESTINATION_ENVIRONMENTS.map((environment) => buildRouteCandidate(intent, environment, scenario));
}

function buildRouteCandidate(intent, environment, scenario) {
  const amountIn = Number(intent.amountIn);
  const scenarioMultiplier = getScenarioMultiplier(scenario, environment.id);
  const seedPrefix = `${intent.intentId}:${environment.id}:${scenario}`;

  const loadShock = seededUnitInterval(`${seedPrefix}:load`);
  const speedShock = seededUnitInterval(`${seedPrefix}:speed`);
  const fillShock = seededUnitInterval(`${seedPrefix}:fill`);

  const congestionScore = clamp(
    environment.baseCongestion + (loadShock - 0.5) * 0.22 + scenarioMultiplier.congestion,
    0.05,
    0.98
  );

  const estimatedFeeUsd = round(
    environment.baseFeeUsd +
      amountIn * (environment.feeBps / 10000) +
      congestionScore * scenarioMultiplier.feePressure,
    4
  );

  const estimatedLatencyMs = Math.round(
    environment.baseLatencyMs * (1 + congestionScore * environment.latencyPressure + speedShock * 0.15)
  );

  const successProbability = clamp(
    environment.baseSuccessProbability -
      congestionScore * environment.reliabilityPenalty -
      fillShock * scenarioMultiplier.failurePressure,
    0.45,
    0.995
  );

  const executionSpreadBps = environment.spreadBps + Math.round(congestionScore * 18);
  const expectedAmountOut = round(amountIn * (1 - executionSpreadBps / 10000), 4);
  const invalidReasons = [];

  if (intent.intentType !== "swap" && intent.tokenIn !== intent.tokenOut) {
    invalidReasons.push("non_swap_token_mismatch");
  }

  if (intent.minAmountOut !== undefined && expectedAmountOut < intent.minAmountOut) {
    invalidReasons.push("minimum_output_not_met");
  }

  if (new Date(intent.deadline).getTime() < Date.now()) {
    invalidReasons.push("deadline_expired");
  }

  if (successProbability < 0.55) {
    invalidReasons.push("predicted_success_too_low");
  }

  return {
    routeId: `${intent.intentId}:${environment.id}`,
    environmentId: environment.id,
    environmentName: environment.name,
    destinationChainId: environment.chainId,
    estimatedFeeUsd,
    estimatedLatencyMs,
    congestionScore: round(congestionScore, 4),
    successProbability: round(successProbability, 4),
    expectedAmountOut,
    valid: invalidReasons.length === 0,
    invalidReasons
  };
}

function getScenarioMultiplier(scenario, environmentId) {
  if (scenario === "burst") {
    return {
      congestion: environmentId === "fast-rollup" ? 0.08 : 0.18,
      feePressure: environmentId === "cheap-rollup" ? 0.45 : 0.7,
      failurePressure: environmentId === "congested-rollup" ? 0.18 : 0.06
    };
  }

  if (scenario === "stress") {
    return {
      congestion: environmentId === "fast-rollup" ? 0.14 : 0.24,
      feePressure: 0.9,
      failurePressure: environmentId === "congested-rollup" ? 0.25 : 0.1
    };
  }

  return {
    congestion: 0,
    feePressure: environmentId === "cheap-rollup" ? 0.18 : 0.3,
    failurePressure: environmentId === "congested-rollup" ? 0.1 : 0.03
  };
}
