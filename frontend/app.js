const form = document.querySelector("#intent-form");
const quoteButton = document.querySelector("#quote-button");
const feedback = document.querySelector("#form-feedback");
const environmentList = document.querySelector("#environment-list");
const routeSummary = document.querySelector("#route-summary");
const routeTableWrap = document.querySelector("#route-table-wrap");
const timeline = document.querySelector("#timeline");
const benchmarkSummary = document.querySelector("#benchmark-summary");
const modeBanner = document.querySelector("#mode-banner");

let activeIntentId = null;
let pollHandle = null;
let runtimeMode = { onChain: false, deployments: null };

bootstrap();

async function bootstrap() {
  await Promise.all([loadEnvironments(), loadBenchmarkSummary(), loadRuntimeMode()]);
  quoteButton.addEventListener("click", previewRoutes);
  form.addEventListener("submit", submitIntent);
  bindPreferenceToggle();
  bindWeightSliders();
}

function bindPreferenceToggle() {
  const select = document.querySelector("#preference-select");
  const fieldset = document.querySelector("#weights-fieldset");
  if (!select || !fieldset) return;
  const sync = () => {
    fieldset.classList.toggle("hidden", select.value !== "custom");
  };
  select.addEventListener("change", sync);
  sync();
}

function bindWeightSliders() {
  document.querySelectorAll("#weights-fieldset input[type=range]").forEach((input) => {
    const key = input.name.replace("weight-", "");
    const output = document.querySelector(`#weights-fieldset output[data-out="${key}"]`);
    if (output) {
      output.textContent = Number(input.value).toFixed(2);
    }
    input.addEventListener("input", () => {
      if (output) output.textContent = Number(input.value).toFixed(2);
    });
  });
}

async function loadRuntimeMode() {
  try {
    const response = await fetch("/api/mode");
    runtimeMode = await response.json();
  } catch (_) {
    runtimeMode = { onChain: false, deployments: null };
  }
  renderModeBanner();
}

function renderModeBanner() {
  if (!modeBanner) return;
  if (runtimeMode.onChain) {
    const chains = runtimeMode.deployments?.chains ?? {};
    const originRpc = chains.origin?.rpc ?? "?";
    const escrow = chains.origin?.contracts?.IntentEscrow ?? "?";
    modeBanner.className = "mode-banner mode-banner-onchain";
    modeBanner.innerHTML =
      `<strong>On-chain mode</strong> — origin Anvil ${originRpc}, escrow <code>${escrow}</code>. ` +
      `Lifecycle events below carry real tx hashes and gas measurements.`;
  } else {
    modeBanner.className = "mode-banner mode-banner-simulated";
    modeBanner.textContent =
      "Simulated lifecycle. Run npm run chains:start && npm run chains:deploy && ONCHAIN_MODE=1 npm run dev for real transactions.";
  }
}

async function loadEnvironments() {
  const response = await fetch("/api/environments");
  const payload = await response.json();

  environmentList.innerHTML = payload.destinations
    .map(
      (environment) => `
        <article class="environment-card">
          <div class="environment-role">
            <span class="role-chip">${lookupEnvironmentRole(environment.id)}</span>
            <span class="subline">Chain ID ${environment.chainId}</span>
          </div>
          <div class="environment-topline">
            <div>
              <p class="chain-name">${lookupEnvironmentLabel(environment.id, environment.name)}</p>
              <p class="chain-meta">${lookupEnvironmentSubtitle(environment.id)}</p>
            </div>
          </div>
          <p class="chain-description">${environment.description}</p>
        </article>
      `
    )
    .join("");
}

async function loadBenchmarkSummary() {
  try {
    const response = await fetch("/api/benchmark-sample");
    if (!response.ok) {
      throw new Error("benchmark sample not ready");
    }
    const payload = await response.json();
    renderBenchmarkSummary(payload);
  } catch (error) {
    benchmarkSummary.innerHTML =
      "Benchmark sample not found yet. Run <code>npm run benchmark:sample</code> and refresh.";
  }
}

async function previewRoutes() {
  feedback.textContent = "";
  const payload = buildIntentPayload();

  try {
    const response = await fetch("/api/intents/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!response.ok) {
      renderErrors(data.details ?? [data.error ?? "Route preview failed"]);
      return;
    }

    renderQuote(data);
  } catch (error) {
    renderErrors([error.message]);
  }
}

async function submitIntent(event) {
  event.preventDefault();
  feedback.textContent = "";
  const payload = buildIntentPayload();

  try {
    const response = await fetch("/api/intents/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!response.ok) {
      renderErrors(data.details ?? [data.error ?? "Intent submission failed"]);
      return;
    }

    activeIntentId = data.id;
    renderQuote({
      intent: data.intent,
      selectedRoute: data.selectedRoute,
      candidates: data.candidates,
      preference: data.intent.preference
    });
    renderTimeline(data.events);
    feedback.innerHTML = `<span class="success">Intent submitted: ${data.id}</span>`;
    startPolling();
  } catch (error) {
    renderErrors([error.message]);
  }
}

function buildIntentPayload() {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.amountIn = Number(payload.amountIn);
  payload.sourceChainId = Number(payload.sourceChainId);
  payload.minAmountOut = payload.minAmountOut ? Number(payload.minAmountOut) : undefined;
  payload.deadline = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  if (payload.preference === "custom") {
    payload.customWeights = {
      cost: Number(payload["weight-cost"] ?? 0.25),
      latency: Number(payload["weight-latency"] ?? 0.25),
      reliability: Number(payload["weight-reliability"] ?? 0.25),
      congestion: Number(payload["weight-congestion"] ?? 0.25)
    };
  }
  delete payload["weight-cost"];
  delete payload["weight-latency"];
  delete payload["weight-reliability"];
  delete payload["weight-congestion"];

  if (!payload.executionTarget) delete payload.executionTarget;
  return payload;
}

function renderQuote(data) {
  const selected = data.selectedRoute;
  const validCount = data.candidates.filter((c) => c.valid !== false).length;
  const invalidCount = data.candidates.length - validCount;

  routeSummary.innerHTML = selected
    ? `
      <header class="section-header">
        <span class="section-eyebrow">Step 1 · Selected Route</span>
        <h3 class="section-title">${lookupEnvironmentLabel(selected.environmentId, selected.environmentName)} wins under ${lookupPreferenceLabel(data.preference)}</h3>
      </header>
      <div class="summary-grid">
        <div class="summary-tile">
          <p class="card-label">Chosen Destination</p>
          <h3>${lookupEnvironmentLabel(selected.environmentId, selected.environmentName)}</h3>
          <p>${lookupEnvironmentSubtitle(selected.environmentId)} · Chain ID ${selected.destinationChainId}</p>
        </div>
        <div class="summary-tile">
          <p class="card-label">Routing Objective</p>
          <h3>${lookupPreferenceLabel(data.preference)}</h3>
          <p>Composite score ${selected.compositeScore}</p>
          <div class="chip-row">
            <span class="summary-chip">Fee $${formatMaybeNumber(selected.estimatedFeeUsd)}</span>
            <span class="summary-chip">Latency ${formatMaybeInteger(selected.estimatedLatencyMs)} ms</span>
          </div>
        </div>
        <div class="summary-tile">
          <p class="card-label">Why It Won</p>
          <ul class="mini-list">
            ${selected.explanation.map((reason) => `<li>${reason}</li>`).join("")}
          </ul>
        </div>
      </div>
    `
    : `
      <header class="section-header">
        <span class="section-eyebrow">Step 1 · Selected Route</span>
        <h3 class="section-title section-title-warning">No route satisfies the current constraints</h3>
      </header>
      <p class="subtle-note">All ${data.candidates.length} candidates were rejected by hard constraints. See the candidate table for individual reasons.</p>
    `;

  routeTableWrap.innerHTML = `
    <header class="section-header section-header-divider">
      <span class="section-eyebrow">Step 2 · All Candidates</span>
      <h3 class="section-title">${data.candidates.length} ranked candidates · ${validCount} valid${invalidCount ? ` · ${invalidCount} rejected` : ""}</h3>
    </header>
    <table class="route-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Route</th>
          <th>Fee</th>
          <th>Latency</th>
          <th>Congestion</th>
          <th>Success</th>
          <th>Score</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${data.candidates
          .map((candidate) => {
            const validity = candidate.valid === false ? `invalid: ${candidate.invalidReasons.join(", ")}` : "valid";
            return `
              <tr class="${candidate.routeId === selected?.routeId ? "selected-row" : ""}">
                <td>${candidate.rank ?? "-"}</td>
                <td>
                  <strong>${lookupEnvironmentLabel(candidate.environmentId, candidate.environmentName)}</strong>
                  <span class="subline">${lookupEnvironmentSubtitle(candidate.environmentId)} · Chain ${candidate.destinationChainId}</span>
                </td>
                <td>$${formatMaybeNumber(candidate.estimatedFeeUsd)}</td>
                <td>${formatMaybeInteger(candidate.estimatedLatencyMs)} ms</td>
                <td>${candidate.congestionScore ?? "-"}</td>
                <td>${candidate.successProbability ?? "-"}</td>
                <td>${candidate.compositeScore ?? "-"}</td>
                <td>${validity === "valid" ? "Valid route" : validity}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderTimeline(events) {
  if (!events || events.length === 0) {
    timeline.innerHTML = "No active intent yet.";
    return;
  }
  const latest = events[events.length - 1];
  timeline.innerHTML = `
    <header class="section-header">
      <span class="section-eyebrow">Step 3 · Execution Lifecycle</span>
      <h3 class="section-title">${events.length} events · current status: <span class="status-pill status-pill-${slugifyStatus(latest.status)}">${latest.status}</span></h3>
    </header>
    <ol class="timeline-list">
      ${events.map(renderTimelineItem).join("")}
    </ol>
  `;
}

function slugifyStatus(status) {
  if (!status) return "default";
  if (["settled", "filled"].includes(status)) return "success";
  if (["failed", "refunded"].includes(status)) return "warning";
  if (["filled-destination", "submitted", "escrowed"].includes(status)) return "progress";
  return "default";
}

function renderTimelineItem(event) {
  const onchain = event.txHash
    ? `<div class="chain-meta-row">
         <span class="chain-tag">${event.chain ?? "chain"}</span>
         <code class="tx-hash" title="${event.txHash}">${shortenHash(event.txHash)}</code>
         ${event.gasUsed ? `<span class="gas-tag">gas ${event.gasUsed.toLocaleString()}</span>` : ""}
       </div>`
    : "";
  return `
    <li class="timeline-item ${event.txHash ? "timeline-item-onchain" : ""}">
      <div class="timeline-badge">${event.status}</div>
      <div>
        <p>${event.note}</p>
        <span class="subline">${new Date(event.at).toLocaleTimeString()}</span>
        ${onchain}
      </div>
    </li>
  `;
}

function shortenHash(hash) {
  if (!hash || hash.length < 12) return hash ?? "";
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

function renderBenchmarkSummary(payload) {
  const findings = payload.keyFindings ?? [];
  benchmarkSummary.innerHTML = `
    <div class="benchmark-stack">
      <p class="benchmark-caption">${payload.headline ?? `Scenario: ${payload.scenario}`}</p>
      ${
        findings.length > 0
          ? `
        <ul class="mini-list">
          ${findings.map((finding) => `<li>${finding}</li>`).join("")}
        </ul>
      `
          : ""
      }
      ${payload.results
        .map(
          (result) => `
            <article class="benchmark-card">
              <div class="benchmark-head">
                <strong>${lookupPolicyLabel(result.policy)}</strong>
                <span>rank ${result.benchmarkRank} / score ${result.compositeOperationalScore}</span>
              </div>
              <div class="metric-row">
                <span>avg fee</span>
                <span>$${result.averageFeeUsd}</span>
              </div>
              <div class="metric-row">
                <span>avg latency</span>
                <span>${result.averageLatencyMs} ms</span>
              </div>
              <div class="metric-row">
                <span>p95 latency</span>
                <span>${result.p95LatencyMs} ms</span>
              </div>
              <div class="metric-row">
                <span>success rate</span>
                <span>${Math.round(result.successRate * 100)}%</span>
              </div>
              <div class="metric-row">
                <span>valid route rate</span>
                <span>${Math.round(result.validRouteRate * 100)}%</span>
              </div>
              <div class="metric-row">
                <span>dominant route</span>
                <span>${lookupEnvironmentLabel(result.dominantEnvironment, result.dominantEnvironment)}</span>
              </div>
              <div class="bar-track">
                <span class="bar-fill" style="width:${Math.round(result.compositeOperationalScore * 100)}%"></span>
              </div>
            </article>
          `
        )
        .join("")}
      <div class="button-row">
        <a class="button ghost" href="/charts.html">Open Full Experiment Board</a>
      </div>
    </div>
  `;
}

function renderErrors(errors) {
  feedback.innerHTML = `<span class="error">${errors.join("<br />")}</span>`;
}

function startPolling() {
  if (pollHandle) {
    clearInterval(pollHandle);
  }

  pollHandle = setInterval(async () => {
    if (!activeIntentId) {
      clearInterval(pollHandle);
      return;
    }

    const response = await fetch(`/api/intents/${activeIntentId}`);
    const data = await response.json();
    renderTimeline(data.events);

    if (["settled", "refunded"].includes(data.status)) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
  }, 800);
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

function lookupEnvironmentSubtitle(environmentId) {
  const subtitles = {
    "fast-rollup": "speed-first execution profile",
    "cheap-rollup": "cost-first execution profile",
    "congested-rollup": "degraded fallback profile"
  };

  return subtitles[environmentId] ?? "destination profile";
}

function lookupEnvironmentRole(environmentId) {
  const labels = {
    "fast-rollup": "Lowest latency",
    "cheap-rollup": "Lowest fee",
    "congested-rollup": "Stress-case baseline"
  };

  return labels[environmentId] ?? "Execution profile";
}

function lookupPreferenceLabel(preference) {
  const labels = {
    balanced: "Balanced utility",
    cheapest: "Minimize fee",
    fastest: "Minimize latency",
    reliable: "Maximize completion"
  };

  return labels[preference] ?? preference;
}

function lookupPolicyLabel(policy) {
  const labels = {
    balanced: "Dynamic: Balanced",
    cheapest: "Dynamic: Cheapest",
    fastest: "Dynamic: Fastest",
    reliable: "Dynamic: Reliable",
    "fixed-fast-rollup": "Static: FastRollup",
    "fixed_cheap-rollup": "Static: CheapRollup",
    "fixed-cheap-rollup": "Static: CheapRollup",
    "fixed_fast-rollup": "Static: FastRollup",
    "fixed-congested-rollup": "Static: CongestedRollup",
    "fixed_congested-rollup": "Static: CongestedRollup"
  };

  return labels[policy] ?? policy;
}

function formatMaybeNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }

  return Number(value).toFixed(3).replace(/\.?0+$/, "");
}

function formatMaybeInteger(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }

  return Math.round(Number(value));
}
