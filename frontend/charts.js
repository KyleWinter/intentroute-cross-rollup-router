const findingsNode = document.querySelector("#board-findings");
const kpisNode = document.querySelector("#board-kpis");
const aggregateNode = document.querySelector("#aggregate-ranking");
const winnerMatrixNode = document.querySelector("#winner-matrix");
const scenarioSelect = document.querySelector("#scenario-select");
const workloadSelect = document.querySelector("#workload-select");
const experimentContextNode = document.querySelector("#experiment-context");
const experimentHighlightsNode = document.querySelector("#experiment-highlights");
const scatterWrap = document.querySelector("#scatter-wrap");
const experimentResultsNode = document.querySelector("#experiment-results");

const state = {
  data: null,
  selectedScenario: null,
  selectedWorkload: null
};

bootstrap();

async function bootstrap() {
  try {
    const response = await fetch("/api/benchmark-expanded");
    if (!response.ok) {
      throw new Error("Benchmark data is not ready yet.");
    }

    state.data = await response.json();
    initializeSelection();
    renderStaticBoard();
    renderExperimentDrilldown();
    bindControls();
  } catch (error) {
    const message = `
      <p>Unable to load the expanded benchmark dataset.</p>
      <p class="subtle-note">${error.message}</p>
      <p class="subtle-note">Run <code>npm run benchmark:sample</code> and refresh the page.</p>
    `;

    findingsNode.innerHTML = message;
    aggregateNode.innerHTML = message;
    winnerMatrixNode.innerHTML = message;
    scatterWrap.innerHTML = message;
    experimentResultsNode.innerHTML = message;
  }
}

function initializeSelection() {
  const preferred = state.data.experiments.find(
    (experiment) => experiment.scenario === "burst" && experiment.workloadId === "mixed_orderflow"
  );

  const fallback = preferred ?? state.data.experiments[0];
  state.selectedScenario = fallback.scenario;
  state.selectedWorkload = fallback.workloadId;

  const scenarios = unique(state.data.experiments.map((experiment) => experiment.scenario));
  const workloads = unique(state.data.experiments.map((experiment) => experiment.workloadId));

  scenarioSelect.innerHTML = scenarios
    .map((scenario) => `<option value="${scenario}" ${scenario === state.selectedScenario ? "selected" : ""}>${lookupScenarioLabel(scenario)}</option>`)
    .join("");

  workloadSelect.innerHTML = workloads
    .map((workload) => `<option value="${workload}" ${workload === state.selectedWorkload ? "selected" : ""}>${lookupWorkloadLabel(workload)}</option>`)
    .join("");
}

function bindControls() {
  scenarioSelect.addEventListener("change", () => {
    state.selectedScenario = scenarioSelect.value;
    renderExperimentDrilldown();
  });

  workloadSelect.addEventListener("change", () => {
    state.selectedWorkload = workloadSelect.value;
    renderExperimentDrilldown();
  });
}

function renderStaticBoard() {
  renderFindings();
  renderKpis();
  renderAggregateRanking();
  renderWinnerMatrix();
}

function renderFindings() {
  findingsNode.innerHTML = `
    <div class="findings-layout">
      <div>
        <p class="card-label">Generated</p>
        <h3>${formatTimestamp(state.data.generatedAt)}</h3>
        <p class="subtle-note">Matrix size: ${state.data.experiments.length} scenario-workload cells.</p>
      </div>
      <ul class="mini-list">
        ${state.data.keyFindings.map((finding) => `<li>${rewriteNarrativeLabels(finding)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderKpis() {
  const aggregate = state.data.aggregatePolicyRanking;
  const bestOverall = aggregate[0];
  const bestDynamic = aggregate.find((policy) => policy.policyType === "dynamic");
  const bestStatic = aggregate.find((policy) => policy.policyType === "static");
  const summary = state.data.dynamicVsStaticSummary;

  const cards = [
    {
      label: "Best Overall",
      value: lookupPolicyLabel(bestOverall.policyLabel),
      meta: `avg rank ${bestOverall.averageRank} / score ${bestOverall.averageBenchmarkScore}`
    },
    {
      label: "Best Dynamic",
      value: lookupPolicyLabel(bestDynamic.policyLabel),
      meta: `completion ${formatPercent(bestDynamic.averageCompletionRate)}`
    },
    {
      label: "Best Static",
      value: lookupPolicyLabel(bestStatic.policyLabel),
      meta: `completion ${formatPercent(bestStatic.averageCompletionRate)}`
    },
    {
      label: "Dynamic Wins",
      value: `${summary.dynamicWinCount} / ${state.data.experiments.length}`,
      meta: "Cells where a dynamic policy ranked first"
    },
    {
      label: "Static Wins",
      value: `${summary.staticWinCount} / ${state.data.experiments.length}`,
      meta: "Cells where a fixed-route baseline ranked first"
    }
  ];

  kpisNode.innerHTML = cards
    .map(
      (card) => `
        <article class="kpi-card">
          <p class="card-label">${card.label}</p>
          <h3>${card.value}</h3>
          <p class="subtle-note">${card.meta}</p>
        </article>
      `
    )
    .join("");
}

function renderAggregateRanking() {
  const rows = state.data.aggregatePolicyRanking;
  const maxScore = Math.max(...rows.map((row) => row.averageBenchmarkScore));

  aggregateNode.innerHTML = `
    <div class="ranking-stack">
      ${rows
        .map((row) => {
          const width = Math.max(12, Math.round((row.averageBenchmarkScore / maxScore) * 100));
          const tone = row.policyType === "dynamic" ? "dynamic-tone" : "static-tone";
          return `
            <article class="ranking-row ${tone}">
              <div class="ranking-header">
                <div>
                  <strong>${lookupPolicyLabel(row.policyLabel)}</strong>
                  <span class="subline">${describePolicyType(row.policyType)}</span>
                </div>
                <span class="ranking-rank">avg rank ${row.averageRank}</span>
              </div>
              <div class="bar-track ranking-bar">
                <span class="bar-fill" style="width:${width}%"></span>
              </div>
              <div class="ranking-metrics">
                <span>score ${row.averageBenchmarkScore}</span>
                <span>fee $${formatNumber(row.averageFeeUsd)}</span>
                <span>p95 ${formatInteger(row.averageP95LatencyMs)} ms</span>
                <span>valid ${formatPercent(row.averageValidRouteRate)}</span>
                <span>complete ${formatPercent(row.averageCompletionRate)}</span>
                <span>${row.firstPlaceCount} wins</span>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderWinnerMatrix() {
  const scenarios = unique(state.data.experiments.map((experiment) => experiment.scenario));
  const workloads = unique(state.data.experiments.map((experiment) => experiment.workloadId));

  const cells = [];
  cells.push(`<div class="matrix-cell matrix-head"></div>`);

  for (const workload of workloads) {
    cells.push(`<div class="matrix-cell matrix-head">${lookupWorkloadLabel(workload)}</div>`);
  }

  for (const scenario of scenarios) {
    cells.push(`<div class="matrix-cell matrix-head matrix-side">${lookupScenarioLabel(scenario)}</div>`);
    for (const workload of workloads) {
      const experiment = findExperiment(scenario, workload);
      const winner = experiment.results[0];
      const tone = winner.policyType === "dynamic" ? "matrix-dynamic" : "matrix-static";
      cells.push(`
        <div class="matrix-cell ${tone}">
          <span class="matrix-chip">${describePolicyType(winner.policyType)}</span>
          <p class="matrix-title">${lookupPolicyLabel(winner.policyLabel)}</p>
          <p class="matrix-meta">dominant route ${lookupEnvironmentLabel(winner.dominantEnvironment, winner.dominantEnvironment)}</p>
          <p class="matrix-meta">score ${winner.overallBenchmarkScore}</p>
        </div>
      `);
    }
  }

  winnerMatrixNode.innerHTML = `<div class="winner-matrix">${cells.join("")}</div>`;
}

function renderExperimentDrilldown() {
  const experiment = findExperiment(state.selectedScenario, state.selectedWorkload);
  renderExperimentContext(experiment);
  renderExperimentHighlights(experiment);
  renderScatterPlot(experiment);
  renderExperimentResults(experiment);
}

function renderExperimentContext(experiment) {
  experimentContextNode.innerHTML = `
    <article class="context-card">
      <div class="context-grid">
        <div>
          <p class="card-label">Selected Benchmark Cell</p>
          <h3>${experiment.scenarioLabel} · ${experiment.workloadLabel}</h3>
          <p>${experiment.workloadDescription}</p>
        </div>
        <div class="chip-row">
          <span class="summary-chip"><strong>Total intents</strong> ${experiment.totalIntents}</span>
          <span class="summary-chip"><strong>Best overall</strong> ${lookupPolicyLabel(experiment.highlights.bestOverall)}</span>
          <span class="summary-chip"><strong>Best dynamic</strong> ${lookupPolicyLabel(experiment.highlights.bestDynamic)}</span>
          <span class="summary-chip"><strong>Best static</strong> ${lookupPolicyLabel(experiment.highlights.bestStatic)}</span>
        </div>
      </div>
    </article>
  `;
}

function renderExperimentHighlights(experiment) {
  const cards = [
    {
      label: "Overall Winner",
      value: lookupPolicyLabel(experiment.highlights.bestOverall),
      meta: `${experiment.scenarioLabel} / ${experiment.workloadLabel}`
    },
    {
      label: "Best Dynamic",
      value: lookupPolicyLabel(experiment.highlights.bestDynamic),
      meta: "Best adaptive routing policy in this cell"
    },
    {
      label: "Best Static",
      value: lookupPolicyLabel(experiment.highlights.bestStatic),
      meta: "Best pinned-route baseline in this cell"
    },
    {
      label: "Cheapest",
      value: lookupPolicyLabel(experiment.highlights.lowestFee),
      meta: "Lowest average actual fee"
    },
    {
      label: "Fastest",
      value: lookupPolicyLabel(experiment.highlights.lowestLatency),
      meta: "Lowest p95 latency"
    },
    {
      label: "Most Reliable",
      value: lookupPolicyLabel(experiment.highlights.highestCompletion),
      meta: "Highest completion rate"
    }
  ];

  experimentHighlightsNode.innerHTML = cards
    .map(
      (card) => `
        <article class="kpi-card">
          <p class="card-label">${card.label}</p>
          <h3>${card.value}</h3>
          <p class="subtle-note">${card.meta}</p>
        </article>
      `
    )
    .join("");
}

function renderScatterPlot(experiment) {
  const results = experiment.results;
  const width = 760;
  const height = 420;
  const margin = { top: 24, right: 24, bottom: 56, left: 76 };

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const feeValues = results.map((result) => result.averageActualFeeUsd);
  const latencyValues = results.map((result) => result.p95ActualLatencyMs);

  const feeDomain = paddedDomain(feeValues);
  const latencyDomain = paddedDomain(latencyValues);

  const ticks = 4;
  const verticalGrid = Array.from({ length: ticks + 1 }, (_, index) => {
    const value = feeDomain.min + ((feeDomain.max - feeDomain.min) * index) / ticks;
    const x = margin.left + (innerWidth * index) / ticks;
    return { value, x };
  });

  const horizontalGrid = Array.from({ length: ticks + 1 }, (_, index) => {
    const value = latencyDomain.min + ((latencyDomain.max - latencyDomain.min) * index) / ticks;
    const y = margin.top + innerHeight - (innerHeight * index) / ticks;
    return { value, y };
  });

  const points = results
    .map((result) => {
      const x = scale(result.averageActualFeeUsd, feeDomain.min, feeDomain.max, margin.left, margin.left + innerWidth);
      const y = scale(
        result.p95ActualLatencyMs,
        latencyDomain.min,
        latencyDomain.max,
        margin.top + innerHeight,
        margin.top
      );
      const radius = 10 + result.completionRate * 16;
      const tone = result.policyType === "dynamic" ? "var(--teal)" : "var(--copper)";
      const label = lookupShortPolicyLabel(result.policyLabel);

      return `
        <g class="scatter-point">
          <circle cx="${x}" cy="${y}" r="${radius}" fill="${tone}" fill-opacity="0.22" stroke="${tone}" stroke-width="2"></circle>
          <text x="${x}" y="${y - radius - 8}" text-anchor="middle" class="scatter-label">${label}</text>
        </g>
      `;
    })
    .join("");

  scatterWrap.innerHTML = `
    <div class="scatter-shell">
      <svg viewBox="0 0 ${width} ${height}" class="scatter-chart" role="img" aria-label="Policy scatter plot">
        ${verticalGrid
          .map(
            (tick) => `
              <line x1="${tick.x}" y1="${margin.top}" x2="${tick.x}" y2="${margin.top + innerHeight}" class="scatter-grid"></line>
              <text x="${tick.x}" y="${height - 20}" text-anchor="middle" class="scatter-axis">${formatNumber(tick.value)}</text>
            `
          )
          .join("")}
        ${horizontalGrid
          .map(
            (tick) => `
              <line x1="${margin.left}" y1="${tick.y}" x2="${margin.left + innerWidth}" y2="${tick.y}" class="scatter-grid"></line>
              <text x="${margin.left - 14}" y="${tick.y + 4}" text-anchor="end" class="scatter-axis">${formatInteger(tick.value)}</text>
            `
          )
          .join("")}
        <line x1="${margin.left}" y1="${margin.top + innerHeight}" x2="${margin.left + innerWidth}" y2="${margin.top + innerHeight}" class="scatter-axis-line"></line>
        <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + innerHeight}" class="scatter-axis-line"></line>
        ${points}
        <text x="${margin.left + innerWidth / 2}" y="${height - 4}" text-anchor="middle" class="scatter-title">Average Actual Fee (USD)</text>
        <text x="18" y="${margin.top + innerHeight / 2}" text-anchor="middle" class="scatter-title" transform="rotate(-90 18 ${margin.top + innerHeight / 2})">P95 Latency (ms)</text>
      </svg>
      <div class="legend-row">
        <span class="legend-item"><span class="legend-swatch dynamic-dot"></span>dynamic policy</span>
        <span class="legend-item"><span class="legend-swatch static-dot"></span>static baseline</span>
        <span class="legend-item">bubble size = completion rate</span>
      </div>
    </div>
  `;
}

function renderExperimentResults(experiment) {
  experimentResultsNode.innerHTML = `
    <div class="result-card-stack">
      ${experiment.results
        .map((result) => {
          const segments = buildRouteSegments(result.routeDistribution, result.routedIntents);
          const tone = result.policyType === "dynamic" ? "dynamic-tone" : "static-tone";
          return `
            <article class="result-card ${tone}">
              <div class="result-card-header">
                <div>
                  <strong>${lookupPolicyLabel(result.policyLabel)}</strong>
                  <span class="subline">${describePolicyType(result.policyType)}</span>
                </div>
                <span class="ranking-rank">rank ${result.benchmarkRank}</span>
              </div>
              <div class="result-metrics-grid">
                <span>score <strong>${result.overallBenchmarkScore}</strong></span>
                <span>valid <strong>${formatPercent(result.validRouteRate)}</strong></span>
                <span>complete <strong>${formatPercent(result.completionRate)}</strong></span>
                <span>avg fee <strong>$${formatNumber(result.averageActualFeeUsd)}</strong></span>
                <span>avg latency <strong>${formatInteger(result.averageActualLatencyMs)} ms</strong></span>
                <span>p95 latency <strong>${formatInteger(result.p95ActualLatencyMs)} ms</strong></span>
              </div>
              <div class="distribution-label-row">
                <span>Route distribution</span>
                <span>${lookupEnvironmentLabel(result.dominantEnvironment, result.dominantEnvironment)}</span>
              </div>
              <div class="distribution-bar">
                ${segments
                  .map(
                    (segment) => `
                      <span class="distribution-segment ${segment.tone}" style="width:${segment.width}%"></span>
                    `
                  )
                  .join("")}
              </div>
              <div class="distribution-meta-row">
                <span>FastRollup ${segments[0].percent}%</span>
                <span>CheapRollup ${segments[1].percent}%</span>
                <span>CongestedRollup ${segments[2].percent}%</span>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function buildRouteSegments(distribution, routedIntents) {
  const total = routedIntents || 1;
  return [
    { key: "fast-rollup", tone: "segment-fast" },
    { key: "cheap-rollup", tone: "segment-cheap" },
    { key: "congested-rollup", tone: "segment-congested" }
  ].map((segment) => {
    const count = distribution[segment.key] ?? 0;
    const percent = Math.round((count / total) * 100);
    return {
      ...segment,
      percent,
      width: percent
    };
  });
}

function findExperiment(scenario, workload) {
  return state.data.experiments.find(
    (experiment) => experiment.scenario === scenario && experiment.workloadId === workload
  );
}

function lookupScenarioLabel(scenario) {
  return state.data.experiments.find((experiment) => experiment.scenario === scenario)?.scenarioLabel ?? scenario;
}

function lookupWorkloadLabel(workload) {
  return state.data.experiments.find((experiment) => experiment.workloadId === workload)?.workloadLabel ?? workload;
}

function unique(values) {
  return [...new Set(values)];
}

function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString();
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function formatNumber(value) {
  return Number(value ?? 0).toFixed(3).replace(/\.?0+$/, "");
}

function formatInteger(value) {
  return Math.round(Number(value ?? 0));
}

function lookupPolicyLabel(policy) {
  const labels = {
    balanced: "Dynamic: Balanced",
    cheapest: "Dynamic: Cheapest",
    fastest: "Dynamic: Fastest",
    reliable: "Dynamic: Reliable",
    "fixed-cheap-rollup": "Static: CheapRollup",
    "fixed_cheap-rollup": "Static: CheapRollup",
    "fixed-fast-rollup": "Static: FastRollup",
    "fixed_fast-rollup": "Static: FastRollup",
    "fixed-congested-rollup": "Static: CongestedRollup",
    "fixed_congested-rollup": "Static: CongestedRollup"
  };

  return labels[policy] ?? policy;
}

function lookupShortPolicyLabel(policy) {
  const labels = {
    balanced: "Balanced",
    cheapest: "Cheapest",
    fastest: "Fastest",
    reliable: "Reliable",
    "fixed-cheap-rollup": "Static Cheap",
    "fixed_cheap-rollup": "Static Cheap",
    "fixed-fast-rollup": "Static Fast",
    "fixed_fast-rollup": "Static Fast",
    "fixed-congested-rollup": "Static Congested",
    "fixed_congested-rollup": "Static Congested"
  };

  return labels[policy] ?? policy;
}

function lookupEnvironmentLabel(environmentId, fallback) {
  const labels = {
    "fast-rollup": "FastRollup",
    "cheap-rollup": "CheapRollup",
    "congested-rollup": "CongestedRollup",
    none: "No Feasible Route"
  };

  return labels[environmentId] ?? fallback ?? environmentId;
}

function describePolicyType(policyType) {
  return policyType === "dynamic" ? "dynamic policy" : "static baseline";
}

function rewriteNarrativeLabels(text) {
  return text
    .replaceAll("fixed_cheap-rollup", "Static: CheapRollup")
    .replaceAll("fixed_fast-rollup", "Static: FastRollup")
    .replaceAll("fixed_congested-rollup", "Static: CongestedRollup")
    .replaceAll("fixed-cheap-rollup", "Static: CheapRollup")
    .replaceAll("fixed-fast-rollup", "Static: FastRollup")
    .replaceAll("fixed-congested-rollup", "Static: CongestedRollup")
    .replaceAll("cheap-rollup", "CheapRollup")
    .replaceAll("fast-rollup", "FastRollup")
    .replaceAll("congested-rollup", "CongestedRollup");
}

function paddedDomain(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min || max || 1) * 0.08;
  return {
    min: Math.max(0, min - padding),
    max: max + padding
  };
}

function scale(value, domainMin, domainMax, rangeMin, rangeMax) {
  if (domainMin === domainMax) {
    return (rangeMin + rangeMax) / 2;
  }
  const ratio = (value - domainMin) / (domainMax - domainMin);
  return rangeMin + ratio * (rangeMax - rangeMin);
}
