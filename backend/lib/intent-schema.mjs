import { generateIntentId, toNumber } from "./utils.mjs";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const SUPPORTED_TOKENS = new Set(["USDC", "ETH"]);
const SUPPORTED_TYPES = new Set(["transfer", "transfer_and_execute", "swap"]);
const SUPPORTED_PREFERENCES = new Set(["balanced", "cheapest", "fastest", "reliable", "custom"]);
const WEIGHT_KEYS = ["cost", "latency", "reliability", "congestion"];
const SUPPORTED_OUTCOMES = new Set(["auto", "success", "failure"]);

export function validateIntentPayload(payload = {}) {
  const intentType = payload.intentType ?? "transfer";
  const preference = payload.preference ?? "balanced";
  const tokenIn = String(payload.tokenIn ?? "USDC").toUpperCase();
  const tokenOut = String(payload.tokenOut ?? tokenIn).toUpperCase();
  const amountIn = toNumber(payload.amountIn, NaN);
  const minAmountOut = payload.minAmountOut === undefined ? undefined : toNumber(payload.minAmountOut, NaN);
  const recipient = String(payload.recipient ?? "").trim();
  const sourceChainId = toNumber(payload.sourceChainId ?? 9000, NaN);
  const deadline = payload.deadline ?? new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const forceOutcome = String(payload.forceOutcome ?? "auto").toLowerCase();
  const executionTarget = payload.executionTarget ? String(payload.executionTarget).trim() : undefined;
  const executionPayload = payload.executionPayload ? String(payload.executionPayload).trim() : undefined;
  const customWeights = preference === "custom" ? normalizeCustomWeights(payload.customWeights) : undefined;

  const errors = [];

  if (!SUPPORTED_TYPES.has(intentType)) {
    errors.push("intentType must be transfer, transfer_and_execute, or swap");
  }

  if (!SUPPORTED_PREFERENCES.has(preference)) {
    errors.push("preference must be balanced, cheapest, fastest, or reliable");
  }

  if (!SUPPORTED_TOKENS.has(tokenIn) || !SUPPORTED_TOKENS.has(tokenOut)) {
    errors.push("Only USDC and ETH are supported in the first scaffold");
  }

  if (!Number.isFinite(amountIn) || amountIn <= 0) {
    errors.push("amountIn must be a positive number");
  }

  if (payload.minAmountOut !== undefined && (!Number.isFinite(minAmountOut) || minAmountOut <= 0)) {
    errors.push("minAmountOut must be a positive number when provided");
  }

  if (!ADDRESS_PATTERN.test(recipient)) {
    errors.push("recipient must be a valid hex address");
  }

  if (!Number.isFinite(sourceChainId)) {
    errors.push("sourceChainId must be a number");
  }

  if (Number.isNaN(new Date(deadline).getTime())) {
    errors.push("deadline must be a valid ISO date string");
  }

  if (intentType !== "swap" && tokenIn !== tokenOut) {
    errors.push("Non-swap intents must use the same input and output token");
  }

  if (intentType === "swap" && tokenIn === tokenOut) {
    errors.push("Swap intents must use different input and output tokens");
  }

  if (intentType === "transfer_and_execute" && !executionTarget) {
    errors.push("transfer_and_execute intents must include executionTarget");
  }

  if (executionTarget && executionTarget !== "auto" && !ADDRESS_PATTERN.test(executionTarget)) {
    errors.push("executionTarget must be a valid hex address or the keyword 'auto'");
  }

  if (!SUPPORTED_OUTCOMES.has(forceOutcome)) {
    errors.push("forceOutcome must be auto, success, or failure");
  }

  if (preference === "custom" && !customWeights) {
    errors.push("custom preference requires customWeights with cost/latency/reliability/congestion in [0,1]");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    intent: {
      intentId: payload.intentId ?? generateIntentId(),
      intentType,
      sourceChainId,
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut,
      recipient,
      preference,
      deadline,
      forceOutcome,
      customWeights,
      executionTarget,
      executionPayload
    }
  };
}

function normalizeCustomWeights(raw) {
  if (!raw || typeof raw !== "object") return null;
  const cleaned = {};
  for (const key of WEIGHT_KEYS) {
    const value = toNumber(raw[key], NaN);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      return null;
    }
    cleaned[key] = value;
  }
  const total = WEIGHT_KEYS.reduce((sum, key) => sum + cleaned[key], 0);
  if (total <= 0) return null;
  // Renormalize so weights sum to 1 — the router contract expects that.
  for (const key of WEIGHT_KEYS) {
    cleaned[key] = cleaned[key] / total;
  }
  return cleaned;
}
