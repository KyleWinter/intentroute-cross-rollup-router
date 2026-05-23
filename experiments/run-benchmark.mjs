import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildRouteCandidates, DESTINATION_ENVIRONMENTS } from "../backend/lib/environments.mjs";
import { getPolicyNames, quoteIntent } from "../backend/lib/router.mjs";
import { round, seededUnitInterval } from "../backend/lib/utils.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = join(__dirname, "..");
const dataDir = join(rootDir, "data");
const shouldWrite = process.argv.includes("--write");

const POLICY_DEFINITIONS = [
  ...getPolicyNames().map((policyId) => ({
    id: policyId,
    label: policyId,
    type: "dynamic"
  })),
  ...DESTINATION_ENVIRONMENTS.map((environment) => ({
    id: `fixed-${environment.id}`,
    label: `fixed_${environment.id}`,
    type: "static",
    environmentId: environment.id
  }))
];

const SCENARIOS = [
  { id: "normal", label: "Normal Load" },
  { id: "burst", label: "Bursty Congestion" },
  { id: "stress", label: "Stress Conditions" }
];

const WORKLOAD_DEFINITIONS = [
  {
    id: "retail_payments",
    label: "Retail Payments",
    description: "Small and medium transfer intents with moderate output protection.",
    size: 32,
    buildIntent(index) {
      const amountIn = 18 + index * 4;
      return buildIntentTemplate(index, {
        intentType: "transfer",
        amountIn,
        minAmountOut: round(amountIn * 0.996, 4),
        tokenIn: "USDC",
        tokenOut: "USDC"
      });
    }
  },
  {
    id: "merchant_batches",
    label: "Merchant Settlement",
    description: "Larger transfer-and-execute intents that prioritize dependable completion.",
    size: 24,
    buildIntent(index) {
      const amountIn = 140 + index * 23;
      return buildIntentTemplate(index, {
        intentType: "transfer_and_execute",
        amountIn,
        minAmountOut: round(amountIn * 0.9955, 4),
        tokenIn: "USDC",
        tokenOut: "USDC"
      });
    }
  },
  {
    id: "strict_output_protection",
    label: "Strict Output Protection",
    description: "Transfer intents with tight output guarantees that invalidate weaker routes.",
    size: 28,
    buildIntent(index) {
      const amountIn = 60 + index * 9;
      return buildIntentTemplate(index, {
        intentType: "transfer",
        amountIn,
        minAmountOut: round(amountIn * 0.9985, 4),
        tokenIn: "USDC",
        tokenOut: "USDC"
      });
    }
  },
  {
    id: "mixed_orderflow",
    label: "Mixed Order Flow",
    description: "A mixed workload combining simple transfers and transfer-and-execute intents.",
    size: 36,
    buildIntent(index) {
      const transferAndExecute = index % 4 === 0;
      const amountIn = transferAndExecute ? 180 + index * 11 : 30 + index * 6;
      return buildIntentTemplate(index, {
        intentType: transferAndExecute ? "transfer_and_execute" : "transfer",
        amountIn,
        minAmountOut: round(amountIn * (transferAndExecute ? 0.995 : 0.997), 4),
        tokenIn: "USDC",
        tokenOut: "USDC"
      });
    }
  }
];

const experiments = SCENARIOS.flatMap((scenario) =>
  WORKLOAD_DEFINITIONS.map((workloadDefinition) => runExperiment(scenario, workloadDefinition))
);

const fullOutput = buildFullOutput(experiments);
const sampleOutput = buildSampleOutput(fullOutput);
const markdownReport = buildMarkdownReport(fullOutput);

if (shouldWrite) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, "benchmark-sample.json"), JSON.stringify(sampleOutput, null, 2));
  await writeFile(join(dataDir, "benchmark-expanded.json"), JSON.stringify(fullOutput, null, 2));
  await writeFile(join(dataDir, "benchmark-report.md"), markdownReport);

  console.log(`Wrote benchmark sample to ${join(dataDir, "benchmark-sample.json")}`);
  console.log(`Wrote benchmark matrix to ${join(dataDir, "benchmark-expanded.json")}`);
  console.log(`Wrote benchmark report to ${join(dataDir, "benchmark-report.md")}`);
} else {
  console.log(
    JSON.stringify(
      {
        generatedAt: fullOutput.generatedAt,
        experimentCount: fullOutput.experiments.length,
        featuredExperiment: sampleOutput.featuredExperiment,
        aggregatePolicyRanking: fullOutput.aggregatePolicyRanking
      },
      null,
      2
    )
  );
}

function runExperiment(scenario, workloadDefinition) {
  const intents = Array.from({ length: workloadDefinition.size }, (_, index) =>
    workloadDefinition.buildIntent(index, scenario.id)
  );

  const rawResults = POLICY_DEFINITIONS.map((policy) => evaluatePolicyRun(policy, intents, scenario.id));
  const rankedResults = scoreAndRankResults(rawResults);

  return {
    scenario: scenario.id,
    scenarioLabel: scenario.label,
    workloadId: workloadDefinition.id,
    workloadLabel: workloadDefinition.label,
    workloadDescription: workloadDefinition.description,
    totalIntents: intents.length,
    highlights: buildExperimentHighlights(rankedResults),
    results: rankedResults
  };
}

function evaluatePolicyRun(policy, intents, scenario) {
  const metrics = {
    totalIntents: intents.length,
    routedIntents: 0,
    invalidIntents: 0,
    successfulIntents: 0,
    failedIntents: 0,
    totalEstimatedFeeUsd: 0,
    totalActualFeeUsd: 0,
    totalEstimatedLatencyMs: 0,
    totalActualLatencyMs: 0,
    totalExpectedAmountOut: 0,
    totalDeliveredAmountOut: 0,
    actualLatencies: [],
    routeDistribution: buildEmptyDistribution()
  };

  for (const intent of intents) {
    const selection = selectRouteForPolicy(policy, intent, scenario);

    if (!selection.selectedRoute) {
      metrics.invalidIntents += 1;
      continue;
    }

    const route = selection.selectedRoute;
    const execution = simulateExecution(intent, route, policy.id, scenario);

    metrics.routedIntents += 1;
    metrics.routeDistribution[route.environmentId] += 1;
    metrics.totalEstimatedFeeUsd += route.estimatedFeeUsd;
    metrics.totalActualFeeUsd += execution.actualFeeUsd;
    metrics.totalEstimatedLatencyMs += route.estimatedLatencyMs;
    metrics.totalActualLatencyMs += execution.actualLatencyMs;
    metrics.totalExpectedAmountOut += route.expectedAmountOut;
    metrics.actualLatencies.push(execution.actualLatencyMs);

    if (execution.success) {
      metrics.successfulIntents += 1;
      metrics.totalDeliveredAmountOut += execution.deliveredAmountOut;
    } else {
      metrics.failedIntents += 1;
    }
  }

  const routed = metrics.routedIntents || 1;
  const hasRoutedIntents = metrics.routedIntents > 0;

  return {
    policy: policy.id,
    policyLabel: policy.label,
    policyType: policy.type,
    pinnedEnvironment: policy.environmentId ?? null,
    totalIntents: metrics.totalIntents,
    routedIntents: metrics.routedIntents,
    invalidIntents: metrics.invalidIntents,
    successfulIntents: metrics.successfulIntents,
    failedIntents: metrics.failedIntents,
    validRouteRate: round(metrics.routedIntents / metrics.totalIntents, 4),
    completionRate: round(metrics.successfulIntents / metrics.totalIntents, 4),
    executionFailureRate: round(metrics.failedIntents / routed, 4),
    averageEstimatedFeeUsd: hasRoutedIntents ? round(metrics.totalEstimatedFeeUsd / routed, 4) : 9999,
    averageActualFeeUsd: hasRoutedIntents ? round(metrics.totalActualFeeUsd / routed, 4) : 9999,
    averageEstimatedLatencyMs: hasRoutedIntents ? Math.round(metrics.totalEstimatedLatencyMs / routed) : 999999,
    averageActualLatencyMs: hasRoutedIntents ? Math.round(metrics.totalActualLatencyMs / routed) : 999999,
    p95ActualLatencyMs: hasRoutedIntents ? percentile(metrics.actualLatencies, 0.95) : 999999,
    averageExpectedAmountOut: hasRoutedIntents ? round(metrics.totalExpectedAmountOut / routed, 4) : 0,
    averageDeliveredAmountOut: round(metrics.totalDeliveredAmountOut / Math.max(metrics.successfulIntents, 1), 4),
    routeDistribution: metrics.routeDistribution,
    dominantEnvironment: determineDominantEnvironment(metrics.routeDistribution),
    overallBenchmarkScore: 0,
    benchmarkRank: 0
  };
}

function selectRouteForPolicy(policy, intent, scenario) {
  if (policy.type === "dynamic") {
    return quoteIntent(
      {
        ...intent,
        preference: policy.id
      },
      {
        scenario,
        preferenceOverride: policy.id
      }
    );
  }

  const candidates = buildRouteCandidates(intent, { scenario });
  const selectedRoute = candidates.find((candidate) => candidate.environmentId === policy.environmentId) ?? null;

  if (!selectedRoute || !selectedRoute.valid) {
    return {
      preference: policy.id,
      candidates,
      selectedRoute: null,
      error: "Pinned static route did not satisfy the intent constraints"
    };
  }

  return {
    preference: policy.id,
    candidates,
    selectedRoute: {
      ...selectedRoute,
      rank: 1,
      explanation: [`Static baseline pinned to ${selectedRoute.environmentName}`]
    }
  };
}

function simulateExecution(intent, route, policyId, scenario) {
  const seedBase = `${scenario}:${policyId}:${intent.intentId}:${route.environmentId}`;
  const successRoll = seededUnitInterval(`${seedBase}:success`);
  const latencyRoll = seededUnitInterval(`${seedBase}:latency`);
  const feeRoll = seededUnitInterval(`${seedBase}:fee`);
  const outputRoll = seededUnitInterval(`${seedBase}:output`);

  const success = successRoll <= route.successProbability;
  const actualLatencyMs = Math.round(route.estimatedLatencyMs * (0.92 + latencyRoll * 0.22) * (success ? 1 : 1.08));
  const actualFeeUsd = round(route.estimatedFeeUsd * (0.97 + feeRoll * 0.12), 4);
  const deliveredAmountOut = success ? round(route.expectedAmountOut * (0.997 - outputRoll * 0.003), 4) : 0;

  return {
    success,
    actualLatencyMs,
    actualFeeUsd,
    deliveredAmountOut
  };
}

function scoreAndRankResults(results) {
  if (results.every((result) => result.routedIntents === 0)) {
    return [...results].map((result, index) => ({
      ...result,
      overallBenchmarkScore: 0,
      benchmarkRank: index + 1
    }));
  }

  const feeRange = getRange(results.map((result) => result.averageActualFeeUsd));
  const latencyRange = getRange(results.map((result) => result.p95ActualLatencyMs));
  const completionRange = getRange(results.map((result) => result.completionRate));
  const validRange = getRange(results.map((result) => result.validRouteRate));

  return [...results]
    .map((result) => {
      const feeUtility = invertNormalize(result.averageActualFeeUsd, feeRange);
      const latencyUtility = invertNormalize(result.p95ActualLatencyMs, latencyRange);
      const completionUtility = normalize(result.completionRate, completionRange);
      const validUtility = normalize(result.validRouteRate, validRange);

      const score =
        feeUtility * 0.2 +
        latencyUtility * 0.2 +
        completionUtility * 0.4 +
        validUtility * 0.2;

      return {
        ...result,
        overallBenchmarkScore: round(score, 4)
      };
    })
    .sort((left, right) => {
      if (right.overallBenchmarkScore !== left.overallBenchmarkScore) {
        return right.overallBenchmarkScore - left.overallBenchmarkScore;
      }
      return right.completionRate - left.completionRate;
    })
    .map((result, index) => ({
      ...result,
      benchmarkRank: index + 1
    }));
}

function buildExperimentHighlights(results) {
  const bestOverall = results[0];
  const bestDynamic = results.find((result) => result.policyType === "dynamic") ?? results[0];
  const bestStatic = results.find((result) => result.policyType === "static") ?? results[0];
  const lowestFee = results.reduce((best, current) =>
    current.averageActualFeeUsd < best.averageActualFeeUsd ? current : best
  );
  const lowestLatency = results.reduce((best, current) =>
    current.p95ActualLatencyMs < best.p95ActualLatencyMs ? current : best
  );
  const highestCompletion = results.reduce((best, current) =>
    current.completionRate > best.completionRate ? current : best
  );

  return {
    bestOverall: bestOverall.policyLabel,
    bestDynamic: bestDynamic.policyLabel,
    bestStatic: bestStatic.policyLabel,
    lowestFee: lowestFee.policyLabel,
    lowestLatency: lowestLatency.policyLabel,
    highestCompletion: highestCompletion.policyLabel
  };
}

function buildFullOutput(experiments) {
  const aggregatePolicyRanking = POLICY_DEFINITIONS.map((policy) => {
    const matchingResults = experiments.flatMap((experiment) =>
      experiment.results.filter((result) => result.policy === policy.id)
    );
    const routedResults = matchingResults.filter((result) => result.routedIntents > 0);

    return {
      policy: policy.id,
      policyLabel: policy.label,
      policyType: policy.type,
      firstPlaceCount: matchingResults.filter((result) => result.benchmarkRank === 1).length,
      averageRank: round(
        matchingResults.reduce((sum, result) => sum + result.benchmarkRank, 0) / matchingResults.length,
        3
      ),
      averageBenchmarkScore: round(
        matchingResults.reduce((sum, result) => sum + result.overallBenchmarkScore, 0) / matchingResults.length,
        4
      ),
      averageFeeUsd: routedResults.length
        ? round(routedResults.reduce((sum, result) => sum + result.averageActualFeeUsd, 0) / routedResults.length, 4)
        : null,
      averageP95LatencyMs: routedResults.length
        ? Math.round(routedResults.reduce((sum, result) => sum + result.p95ActualLatencyMs, 0) / routedResults.length)
        : null,
      averageCompletionRate: round(
        matchingResults.reduce((sum, result) => sum + result.completionRate, 0) / matchingResults.length,
        4
      ),
      averageValidRouteRate: round(
        matchingResults.reduce((sum, result) => sum + result.validRouteRate, 0) / matchingResults.length,
        4
      )
    };
  }).sort((left, right) => left.averageRank - right.averageRank);

  return {
    generatedAt: new Date().toISOString(),
    scenarios: SCENARIOS.map((scenario) => scenario.id),
    workloads: WORKLOAD_DEFINITIONS.map((workload) => workload.id),
    policyCatalog: POLICY_DEFINITIONS,
    experiments,
    aggregatePolicyRanking,
    dynamicVsStaticSummary: buildDynamicVsStaticSummary(experiments),
    keyFindings: buildKeyFindings(aggregatePolicyRanking, experiments)
  };
}

function buildSampleOutput(fullOutput) {
  const featuredExperiment =
    fullOutput.experiments.find(
      (experiment) => experiment.scenario === "burst" && experiment.workloadId === "mixed_orderflow"
    ) ?? fullOutput.experiments[0];

  return {
    generatedAt: fullOutput.generatedAt,
    scenario: featuredExperiment.scenario,
    scenarioLabel: featuredExperiment.scenarioLabel,
    workloadId: featuredExperiment.workloadId,
    workloadLabel: featuredExperiment.workloadLabel,
    featuredExperiment: {
      scenario: featuredExperiment.scenario,
      workloadId: featuredExperiment.workloadId,
      bestOverall: featuredExperiment.highlights.bestOverall
    },
    headline: `Featured experiment: ${featuredExperiment.scenarioLabel} / ${featuredExperiment.workloadLabel}`,
    keyFindings: fullOutput.keyFindings,
    results: featuredExperiment.results.map((result) => ({
      policy: result.policyLabel,
      policyType: result.policyType,
      averageFeeUsd: result.averageActualFeeUsd,
      averageLatencyMs: result.averageActualLatencyMs,
      p95LatencyMs: result.p95ActualLatencyMs,
      successRate: result.completionRate,
      validRouteRate: result.validRouteRate,
      compositeOperationalScore: result.overallBenchmarkScore,
      benchmarkRank: result.benchmarkRank,
      dominantEnvironment: result.dominantEnvironment
    }))
  };
}

function buildMarkdownReport(fullOutput) {
  const lines = [];

  lines.push("# Benchmark Report");
  lines.push("");
  lines.push(`Generated at: ${fullOutput.generatedAt}`);
  lines.push("");
  lines.push("## Key Findings");
  lines.push("");

  for (const finding of fullOutput.keyFindings) {
    lines.push(`- ${finding}`);
  }

  lines.push("");
  lines.push("## Dynamic Vs Static Summary");
  lines.push("");
  lines.push(
    `Dynamic winners: ${fullOutput.dynamicVsStaticSummary.dynamicWinCount} / ${fullOutput.experiments.length} experiments.`
  );
  lines.push("");
  lines.push(
    `Static winners: ${fullOutput.dynamicVsStaticSummary.staticWinCount} / ${fullOutput.experiments.length} experiments.`
  );
  lines.push("");

  if (fullOutput.dynamicVsStaticSummary.dynamicWinningCells.length > 0) {
    lines.push(
      `Dynamic-winning cells: ${fullOutput.dynamicVsStaticSummary.dynamicWinningCells
        .map((cell) => `${cell.scenario}/${cell.workload}`)
        .join(", ")}.`
    );
    lines.push("");
  }

  lines.push("## Aggregate Policy Ranking");
  lines.push("");
  lines.push("| Policy | Type | Avg Rank | 1st Places | Avg Score | Avg Fee (USD) | Avg P95 Latency (ms) | Avg Valid Route Rate | Avg Completion |");
  lines.push("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");

  for (const aggregate of fullOutput.aggregatePolicyRanking) {
    lines.push(
      `| ${aggregate.policyLabel} | ${aggregate.policyType} | ${aggregate.averageRank} | ${aggregate.firstPlaceCount} | ${aggregate.averageBenchmarkScore} | ${aggregate.averageFeeUsd ?? "n/a"} | ${aggregate.averageP95LatencyMs ?? "n/a"} | ${formatPercent(aggregate.averageValidRouteRate)} | ${formatPercent(aggregate.averageCompletionRate)} |`
    );
  }

  for (const experiment of fullOutput.experiments) {
    lines.push("");
    lines.push(`## ${experiment.scenarioLabel} / ${experiment.workloadLabel}`);
    lines.push("");
    lines.push(experiment.workloadDescription);
    lines.push("");
    lines.push(
      `Highlights: overall winner \`${experiment.highlights.bestOverall}\`, best dynamic \`${experiment.highlights.bestDynamic}\`, best static \`${experiment.highlights.bestStatic}\`, cheapest \`${experiment.highlights.lowestFee}\`, fastest \`${experiment.highlights.lowestLatency}\`, highest completion \`${experiment.highlights.highestCompletion}\`.`
    );
    lines.push("");
    lines.push("| Rank | Policy | Type | Valid Route Rate | Completion Rate | Avg Fee (USD) | Avg Latency (ms) | P95 Latency (ms) | Dominant Route | Score |");
    lines.push("| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |");

    for (const result of experiment.results) {
      lines.push(
        `| ${result.benchmarkRank} | ${result.policyLabel} | ${result.policyType} | ${formatPercent(result.validRouteRate)} | ${formatPercent(result.completionRate)} | ${result.averageActualFeeUsd} | ${result.averageActualLatencyMs} | ${result.p95ActualLatencyMs} | ${result.dominantEnvironment} | ${result.overallBenchmarkScore} |`
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

function buildKeyFindings(aggregatePolicyRanking, experiments) {
  const bestOverall = aggregatePolicyRanking[0];
  const lowestFee = [...aggregatePolicyRanking].sort((left, right) => left.averageFeeUsd - right.averageFeeUsd)[0];
  const fastest = [...aggregatePolicyRanking].sort((left, right) => left.averageP95LatencyMs - right.averageP95LatencyMs)[0];
  const highestCompletion = [...aggregatePolicyRanking].sort(
    (left, right) => right.averageCompletionRate - left.averageCompletionRate
  )[0];

  const dynamicWinningCells = experiments
    .filter((experiment) => experiment.results[0].policyType === "dynamic")
    .map((experiment) => `${experiment.scenario}/${experiment.workloadId}`);

  return [
    `${bestOverall.policyLabel} achieved the best average rank across the full matrix, indicating the strongest overall balance between route availability, completion rate, cost, and latency.`,
    `${lowestFee.policyLabel} minimized average fee, while ${fastest.policyLabel} delivered the lowest latency profile, highlighting the expected cost-speed trade-off.`,
    `${highestCompletion.policyLabel} achieved the highest average completion rate, and dynamic policies won ${dynamicWinningCells.length} of ${experiments.length} experiment cells overall${dynamicWinningCells.length ? `, especially ${dynamicWinningCells.slice(0, 4).join(", ")}` : ""}.`
  ];
}

function buildDynamicVsStaticSummary(experiments) {
  const dynamicWinningCells = [];
  let dynamicWinCount = 0;
  let staticWinCount = 0;

  for (const experiment of experiments) {
    if (experiment.results[0].policyType === "dynamic") {
      dynamicWinCount += 1;
      dynamicWinningCells.push({
        scenario: experiment.scenario,
        workload: experiment.workloadId,
        winner: experiment.results[0].policyLabel
      });
    } else {
      staticWinCount += 1;
    }
  }

  return {
    dynamicWinCount,
    staticWinCount,
    dynamicWinningCells
  };
}

function buildIntentTemplate(index, overrides) {
  return {
    intentId: `${overrides.intentType}-${index}`,
    sourceChainId: 9000,
    recipient: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    preference: "balanced",
    deadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ...overrides
  };
}

function percentile(values, ratio) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return sorted[index];
}

function determineDominantEnvironment(distribution) {
  const sorted = Object.entries(distribution).sort((left, right) => right[1] - left[1]);
  return sorted[0]?.[1] > 0 ? sorted[0][0] : "none";
}

function buildEmptyDistribution() {
  return Object.fromEntries(DESTINATION_ENVIRONMENTS.map((environment) => [environment.id, 0]));
}

function getRange(values) {
  return {
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

function normalize(value, range) {
  if (range.max === range.min) {
    return 0.5;
  }

  return (value - range.min) / (range.max - range.min);
}

function invertNormalize(value, range) {
  if (range.max === range.min) {
    return 0.5;
  }

  return 1 - (value - range.min) / (range.max - range.min);
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}
