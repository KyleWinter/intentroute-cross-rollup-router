import { generateIntentId, toNumber } from "./utils.mjs";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const SUPPORTED_TOKENS = new Set(["USDC", "ETH"]);
const SUPPORTED_TYPES = new Set(["transfer", "transfer_and_execute", "swap"]);
const SUPPORTED_PREFERENCES = new Set(["balanced", "cheapest", "fastest", "reliable"]);

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
      deadline
    }
  };
}
