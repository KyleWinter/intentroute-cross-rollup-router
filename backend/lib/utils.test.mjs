import { strict as assert } from "node:assert";

import { clamp, hashString, round, seededUnitInterval } from "./utils.mjs";

export default [
  {
    name: "clamp respects min/max bounds",
    fn: () => {
      assert.equal(clamp(5, 0, 10), 5);
      assert.equal(clamp(-2, 0, 10), 0);
      assert.equal(clamp(99, 0, 10), 10);
    }
  },
  {
    name: "round to N digits",
    fn: () => {
      assert.equal(round(1.23456, 2), 1.23);
      assert.equal(round(1.23556, 2), 1.24);
      assert.equal(round(1, 4), 1);
    }
  },
  {
    name: "hashString is deterministic and unsigned",
    fn: () => {
      const a = hashString("foo");
      const b = hashString("foo");
      assert.equal(a, b);
      assert.ok(a >= 0);
      assert.ok(a <= 0xffffffff);
    }
  },
  {
    name: "seededUnitInterval falls inside [0,1] and is deterministic",
    fn: () => {
      for (const seed of ["a", "intent-1", "foo:bar:baz"]) {
        const value = seededUnitInterval(seed);
        assert.ok(value >= 0 && value <= 1, `seed ${seed} → ${value} out of [0,1]`);
        assert.equal(seededUnitInterval(seed), value);
      }
    }
  }
];
