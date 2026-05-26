import { appendIntentEvent } from "./store.mjs";
import { nowIso, seededUnitInterval } from "./utils.mjs";
import { startExecutionOnChain } from "./onchain-simulator.mjs";

// When ONCHAIN_MODE=1, lifecycle events are produced by actually calling the
// IntentEscrow + DestinationVault contracts on local Anvil chains. Otherwise
// we keep the original setTimeout-based simulation for fast benchmarks and
// no-infrastructure demos.
const ONCHAIN_MODE = process.env.ONCHAIN_MODE === "1";

export function startExecutionSimulation(record) {
  if (ONCHAIN_MODE) {
    // Fire-and-forget; the function appends events as it progresses.
    startExecutionOnChain(record);
    return;
  }
  startInMemorySimulation(record);
}

export function isOnChainMode() {
  return ONCHAIN_MODE;
}

function startInMemorySimulation(record) {
  const route = record.selectedRoute;
  const lifecycleMs = Math.max(1500, Math.min(6500, route.estimatedLatencyMs));
  const willFail = decideFailure(record, route);

  schedule(record.id, 350, "submitted", `Intent submitted to ${route.environmentName}`);
  schedule(
    record.id,
    Math.round(lifecycleMs * 0.45),
    "filled",
    `Relayer filled destination on chain ${route.destinationChainId}`
  );

  if (willFail) {
    schedule(
      record.id,
      Math.round(lifecycleMs * 0.75),
      "failed",
      `Execution failed after fill due to simulated settlement risk on ${route.environmentName}`
    );
    schedule(record.id, Math.round(lifecycleMs * 0.92), "refunded", "Escrow marked for refund on the source side");
    return;
  }

  schedule(record.id, Math.round(lifecycleMs * 0.82), "settled", "Settlement completed and registry marked final");
}

function schedule(id, delayMs, status, note) {
  setTimeout(() => {
    appendIntentEvent(id, {
      status,
      note,
      at: nowIso()
    });
  }, delayMs);
}

export function decideFailure(record, route) {
  const forced = record.intent?.forceOutcome;
  if (forced === "failure") return true;
  if (forced === "success") return false;
  return seededUnitInterval(`${record.id}:outcome`) > route.successProbability;
}
