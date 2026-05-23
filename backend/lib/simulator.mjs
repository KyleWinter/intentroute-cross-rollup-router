import { appendIntentEvent } from "./store.mjs";
import { nowIso, seededUnitInterval } from "./utils.mjs";

export function startExecutionSimulation(record) {
  const route = record.selectedRoute;
  const lifecycleMs = Math.max(1500, Math.min(6500, route.estimatedLatencyMs));
  const willFail = seededUnitInterval(`${record.id}:outcome`) > route.successProbability;

  schedule(record.id, 350, "submitted", `Intent submitted to ${route.environmentName}`);
  schedule(record.id, Math.round(lifecycleMs * 0.45), "filled", `Relayer filled destination on chain ${route.destinationChainId}`);

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
