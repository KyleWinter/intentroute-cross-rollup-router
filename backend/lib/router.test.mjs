import { strict as assert } from "node:assert";

import { quoteIntent, getPolicyNames } from "./router.mjs";

const makeIntent = (overrides = {}) => ({
  intentId: overrides.intentId ?? "intent-router-test",
  intentType: "transfer",
  sourceChainId: 9000,
  tokenIn: "USDC",
  tokenOut: "USDC",
  amountIn: 100,
  recipient: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  preference: overrides.preference ?? "balanced",
  deadline: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  ...overrides
});

export default [
  {
    name: "exposes all four policies",
    fn: () => {
      assert.deepEqual([...getPolicyNames()].sort(), [
        "balanced",
        "cheapest",
        "fastest",
        "reliable"
      ]);
    }
  },
  {
    name: "quotes three candidates with strictly decreasing rank by score",
    fn: () => {
      const result = quoteIntent(makeIntent(), { scenario: "normal" });
      const ranked = result.candidates.filter((c) => c.rank !== undefined);
      assert.equal(ranked.length, 3);
      for (let i = 1; i < ranked.length; i += 1) {
        assert.ok(
          ranked[i - 1].compositeScore >= ranked[i].compositeScore,
          `score at rank ${i} (${ranked[i].compositeScore}) exceeds rank ${i - 1} (${ranked[i - 1].compositeScore})`
        );
      }
      assert.equal(result.selectedRoute.rank, 1);
    }
  },
  {
    name: "cheapest preference picks the lowest-fee valid route",
    fn: () => {
      const result = quoteIntent(makeIntent({ preference: "cheapest" }), { scenario: "normal" });
      const valid = result.candidates.filter((c) => c.valid);
      const minFee = Math.min(...valid.map((c) => c.estimatedFeeUsd));
      assert.equal(result.selectedRoute.estimatedFeeUsd, minFee);
    }
  },
  {
    name: "fastest preference picks the lowest-latency valid route",
    fn: () => {
      const result = quoteIntent(makeIntent({ preference: "fastest" }), { scenario: "normal" });
      const valid = result.candidates.filter((c) => c.valid);
      const minLatency = Math.min(...valid.map((c) => c.estimatedLatencyMs));
      assert.equal(result.selectedRoute.estimatedLatencyMs, minLatency);
    }
  },
  {
    name: "seed determinism: same intentId → identical compositeScores",
    fn: () => {
      const left = quoteIntent(makeIntent({ intentId: "seed-1" }), { scenario: "burst" });
      const right = quoteIntent(makeIntent({ intentId: "seed-1" }), { scenario: "burst" });
      for (const candidate of left.candidates) {
        const peer = right.candidates.find((c) => c.routeId === candidate.routeId);
        assert.equal(candidate.compositeScore, peer.compositeScore);
        assert.equal(candidate.estimatedFeeUsd, peer.estimatedFeeUsd);
        assert.equal(candidate.estimatedLatencyMs, peer.estimatedLatencyMs);
      }
    }
  },
  {
    name: "min-output enforcement: an unreachable minAmountOut leaves no valid routes",
    fn: () => {
      const result = quoteIntent(
        makeIntent({ amountIn: 100, minAmountOut: 100 }),
        { scenario: "normal" }
      );
      assert.equal(result.selectedRoute, null);
      assert.ok(result.candidates.every((c) => c.valid === false));
    }
  },
  {
    name: "scenarios shift congestion: stress raises avg congestion vs normal",
    fn: () => {
      const intent = makeIntent({ intentId: "scenario-shift" });
      const normal = quoteIntent(intent, { scenario: "normal" });
      const stress = quoteIntent(intent, { scenario: "stress" });
      const avg = (rs) => rs.candidates.reduce((a, c) => a + c.congestionScore, 0) / rs.candidates.length;
      assert.ok(avg(stress) > avg(normal), `stress congestion ${avg(stress)} not > normal ${avg(normal)}`);
    }
  },
  {
    name: "every selected route carries 2-3 explanation strings",
    fn: () => {
      const result = quoteIntent(makeIntent(), { scenario: "normal" });
      assert.ok(Array.isArray(result.selectedRoute.explanation));
      assert.ok(result.selectedRoute.explanation.length >= 2);
      assert.ok(result.selectedRoute.explanation.length <= 3);
    }
  },
  {
    name: "custom weights override preset weights",
    fn: () => {
      const intent = makeIntent({
        intentId: "custom-weights-1",
        preference: "custom",
        customWeights: { cost: 1, latency: 0, reliability: 0, congestion: 0 }
      });
      const result = quoteIntent(intent, { scenario: "normal" });
      assert.equal(result.preference, "custom");
      assert.equal(result.weights.cost, 1);
      assert.equal(result.weights.latency, 0);
      // With cost weight = 1, the winner must be the cheapest valid route.
      const minFee = Math.min(
        ...result.candidates.filter((c) => c.valid).map((c) => c.estimatedFeeUsd)
      );
      assert.equal(result.selectedRoute.estimatedFeeUsd, minFee);
    }
  },
  {
    name: "swap intent produces non-zero expectedAmountOut on supported pairs",
    fn: () => {
      const intent = {
        intentId: "swap-test",
        intentType: "swap",
        sourceChainId: 9000,
        tokenIn: "USDC",
        tokenOut: "ETH",
        amountIn: 3000,
        recipient: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        preference: "balanced",
        deadline: new Date(Date.now() + 600_000).toISOString()
      };
      const result = quoteIntent(intent, { scenario: "normal" });
      assert.ok(result.selectedRoute, "must select a route");
      assert.ok(result.selectedRoute.expectedAmountOut > 0.9, "should yield ~1 ETH after slippage");
      assert.ok(result.selectedRoute.expectedAmountOut < 1.1, "should not exceed 1 ETH reference rate");
      // Each environment should give a distinct amountOut due to depth + bias differences.
      const outs = result.candidates.map((c) => c.expectedAmountOut);
      assert.ok(new Set(outs).size >= 2, "swap rates should vary across environments");
    }
  }
];
