import { buildRouteCandidates } from "./environments.mjs";
import { clamp, round } from "./utils.mjs";

const POLICY_WEIGHTS = {
  balanced: { cost: 0.3, latency: 0.25, reliability: 0.25, congestion: 0.2 },
  cheapest: { cost: 0.55, latency: 0.1, reliability: 0.15, congestion: 0.2 },
  fastest: { cost: 0.1, latency: 0.5, reliability: 0.25, congestion: 0.15 },
  reliable: { cost: 0.1, latency: 0.15, reliability: 0.5, congestion: 0.25 }
};

export function quoteIntent(intent, options = {}) {
  const preference = options.preferenceOverride ?? intent.preference ?? "balanced";
  const rawCandidates = buildRouteCandidates(intent, options);
  const validCandidates = rawCandidates.filter((candidate) => candidate.valid);

  if (validCandidates.length === 0) {
    return {
      preference,
      candidates: rawCandidates,
      selectedRoute: null,
      error: "No valid routes satisfy the intent constraints"
    };
  }

  const weights = POLICY_WEIGHTS[preference] ?? POLICY_WEIGHTS.balanced;
  const scoredCandidates = scoreCandidates(validCandidates, weights);
  const selectedRoute = scoredCandidates[0];

  return {
    preference,
    weights,
    candidates: [
      ...scoredCandidates,
      ...rawCandidates.filter((candidate) => !candidate.valid)
    ],
    selectedRoute
  };
}

export function getPolicyNames() {
  return Object.keys(POLICY_WEIGHTS);
}

function scoreCandidates(candidates, weights) {
  const feeRange = getRange(candidates.map((candidate) => candidate.estimatedFeeUsd));
  const latencyRange = getRange(candidates.map((candidate) => candidate.estimatedLatencyMs));
  const congestionRange = getRange(candidates.map((candidate) => candidate.congestionScore));
  const reliabilityRange = getRange(candidates.map((candidate) => candidate.successProbability));

  return [...candidates]
    .map((candidate) => {
      const costUtility = invertNormalized(candidate.estimatedFeeUsd, feeRange);
      const latencyUtility = invertNormalized(candidate.estimatedLatencyMs, latencyRange);
      const congestionUtility = invertNormalized(candidate.congestionScore, congestionRange);
      const reliabilityUtility = normalized(candidate.successProbability, reliabilityRange);

      const utilityBreakdown = {
        costUtility: round(costUtility, 4),
        latencyUtility: round(latencyUtility, 4),
        reliabilityUtility: round(reliabilityUtility, 4),
        congestionUtility: round(congestionUtility, 4)
      };

      const weightedScore =
        utilityBreakdown.costUtility * weights.cost +
        utilityBreakdown.latencyUtility * weights.latency +
        utilityBreakdown.reliabilityUtility * weights.reliability +
        utilityBreakdown.congestionUtility * weights.congestion;

      return {
        ...candidate,
        utilityBreakdown,
        compositeScore: round(weightedScore, 4)
      };
    })
    .sort((left, right) => right.compositeScore - left.compositeScore)
    .map((candidate, index, rankedCandidates) => ({
      ...candidate,
      rank: index + 1,
      explanation: buildExplanation(candidate, rankedCandidates)
    }));
}

function buildExplanation(candidate, rankedCandidates) {
  const cheapest = rankedCandidates.reduce((best, current) =>
    current.estimatedFeeUsd < best.estimatedFeeUsd ? current : best
  );
  const fastest = rankedCandidates.reduce((best, current) =>
    current.estimatedLatencyMs < best.estimatedLatencyMs ? current : best
  );
  const mostReliable = rankedCandidates.reduce((best, current) =>
    current.successProbability > best.successProbability ? current : best
  );
  const leastCongested = rankedCandidates.reduce((best, current) =>
    current.congestionScore < best.congestionScore ? current : best
  );

  const explanation = [];

  if (candidate.routeId === cheapest.routeId) {
    explanation.push("lowest estimated fee among valid routes");
  }

  if (candidate.routeId === fastest.routeId) {
    explanation.push("lowest expected latency among valid routes");
  }

  if (candidate.routeId === mostReliable.routeId) {
    explanation.push("highest predicted success probability");
  }

  if (candidate.routeId === leastCongested.routeId) {
    explanation.push("lowest projected congestion pressure");
  }

  if (explanation.length < 2) {
    const strengthOrder = [
      ["costUtility", "strong cost profile after normalization"],
      ["latencyUtility", "strong latency profile after normalization"],
      ["reliabilityUtility", "strong reliability profile after normalization"],
      ["congestionUtility", "healthy congestion outlook relative to peers"]
    ];

    strengthOrder
      .sort((left, right) => candidate.utilityBreakdown[right[0]] - candidate.utilityBreakdown[left[0]])
      .forEach(([utilityKey, reason]) => {
        const utilityValue = candidate.utilityBreakdown[utilityKey];
        if (explanation.length < 2 && !explanation.includes(reason) && utilityValue >= 0.35) {
          explanation.push(reason);
        }
      });
  }

  if (candidate.routeId !== cheapest.routeId) {
    explanation.push(`trades higher fee for better overall execution quality than ${cheapest.environmentName}`);
  } else if (candidate.routeId !== fastest.routeId) {
    explanation.push(`slower than ${fastest.environmentName}, but stronger on cost-adjusted score`);
  }

  return explanation.slice(0, 3);
}

function getRange(values) {
  return {
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

function normalized(value, range) {
  if (range.max === range.min) {
    return 1;
  }
  return clamp((value - range.min) / (range.max - range.min), 0, 1);
}

function invertNormalized(value, range) {
  if (range.max === range.min) {
    return 1;
  }
  return clamp(1 - (value - range.min) / (range.max - range.min), 0, 1);
}
