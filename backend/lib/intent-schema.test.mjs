import { strict as assert } from "node:assert";

import { validateIntentPayload } from "./intent-schema.mjs";

const validBase = () => ({
  intentType: "transfer",
  tokenIn: "USDC",
  tokenOut: "USDC",
  amountIn: 100,
  recipient: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  preference: "balanced"
});

export default [
  {
    name: "accepts a well-formed transfer intent",
    fn: () => {
      const { ok, intent } = validateIntentPayload(validBase());
      assert.equal(ok, true);
      assert.equal(intent.intentType, "transfer");
      assert.equal(intent.amountIn, 100);
      assert.equal(intent.preference, "balanced");
      assert.ok(intent.intentId.startsWith("intent-"));
    }
  },
  {
    name: "rejects malformed recipient",
    fn: () => {
      const { ok, errors } = validateIntentPayload({ ...validBase(), recipient: "not-an-address" });
      assert.equal(ok, false);
      assert.ok(errors.some((message) => message.includes("recipient")));
    }
  },
  {
    name: "rejects non-positive amountIn",
    fn: () => {
      const { ok, errors } = validateIntentPayload({ ...validBase(), amountIn: 0 });
      assert.equal(ok, false);
      assert.ok(errors.some((message) => message.includes("amountIn")));
    }
  },
  {
    name: "rejects unknown preference",
    fn: () => {
      const { ok, errors } = validateIntentPayload({ ...validBase(), preference: "wildcard" });
      assert.equal(ok, false);
      assert.ok(errors.some((message) => message.includes("preference")));
    }
  },
  {
    name: "rejects mismatched tokenIn/tokenOut for non-swap",
    fn: () => {
      const { ok, errors } = validateIntentPayload({ ...validBase(), tokenIn: "USDC", tokenOut: "ETH" });
      assert.equal(ok, false);
      assert.ok(errors.some((message) => message.includes("same input and output token")));
    }
  },
  {
    name: "rejects swap with same tokenIn/tokenOut",
    fn: () => {
      const { ok, errors } = validateIntentPayload({
        ...validBase(),
        intentType: "swap",
        tokenIn: "USDC",
        tokenOut: "USDC"
      });
      assert.equal(ok, false);
      assert.ok(errors.some((message) => message.includes("different input and output")));
    }
  },
  {
    name: "transfer_and_execute requires executionTarget",
    fn: () => {
      const { ok, errors } = validateIntentPayload({
        ...validBase(),
        intentType: "transfer_and_execute"
      });
      assert.equal(ok, false);
      assert.ok(errors.some((m) => m.includes("executionTarget")));
    }
  },
  {
    name: "transfer_and_execute with valid executionTarget passes",
    fn: () => {
      const { ok, intent } = validateIntentPayload({
        ...validBase(),
        intentType: "transfer_and_execute",
        executionTarget: "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707"
      });
      assert.equal(ok, true);
      assert.equal(intent.intentType, "transfer_and_execute");
      assert.equal(intent.executionTarget, "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707");
    }
  },
  {
    name: "forceOutcome accepts auto/success/failure and rejects others",
    fn: () => {
      for (const value of ["auto", "success", "failure"]) {
        const { ok, intent } = validateIntentPayload({ ...validBase(), forceOutcome: value });
        assert.equal(ok, true);
        assert.equal(intent.forceOutcome, value);
      }
      const { ok, errors } = validateIntentPayload({ ...validBase(), forceOutcome: "maybe" });
      assert.equal(ok, false);
      assert.ok(errors.some((m) => m.includes("forceOutcome")));
    }
  },
  {
    name: "custom preference requires customWeights, then renormalizes",
    fn: () => {
      const bare = validateIntentPayload({ ...validBase(), preference: "custom" });
      assert.equal(bare.ok, false);

      const ok = validateIntentPayload({
        ...validBase(),
        preference: "custom",
        customWeights: { cost: 0.5, latency: 0.5, reliability: 0.5, congestion: 0.5 }
      });
      assert.equal(ok.ok, true);
      const total = Object.values(ok.intent.customWeights).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(total - 1) < 1e-9, `weights renormalized to 1, got ${total}`);

      const invalid = validateIntentPayload({
        ...validBase(),
        preference: "custom",
        customWeights: { cost: 1.2, latency: 0.5, reliability: 0.5, congestion: 0.5 }
      });
      assert.equal(invalid.ok, false);
    }
  }
];
