const intents = new Map();

export function saveIntent(record) {
  intents.set(record.id, record);
  return record;
}

export function getIntent(id) {
  return intents.get(id) ?? null;
}

export function listIntents() {
  return [...intents.values()]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .map((record) => summarizeIntent(record));
}

export function appendIntentEvent(id, event) {
  const record = getIntent(id);
  if (!record) {
    return null;
  }
  record.status = event.status;
  record.events.push(event);
  return record;
}

export function summarizeIntent(record) {
  return {
    id: record.id,
    status: record.status,
    createdAt: record.createdAt,
    preference: record.intent.preference,
    intentType: record.intent.intentType,
    amountIn: record.intent.amountIn,
    tokenIn: record.intent.tokenIn,
    tokenOut: record.intent.tokenOut,
    selectedRoute: record.selectedRoute
      ? {
          environmentName: record.selectedRoute.environmentName,
          destinationChainId: record.selectedRoute.destinationChainId,
          compositeScore: record.selectedRoute.compositeScore
        }
      : null
  };
}
