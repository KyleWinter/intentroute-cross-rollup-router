#!/usr/bin/env node
// Lightweight test runner. Loads every *.test.mjs under backend/ and counts
// pass/fail. Each test module exports default an array of { name, fn }.

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");

const failures = [];
let passed = 0;

await walk(join(ROOT, "backend"));

console.log("");
console.log(`${passed} passed, ${failures.length} failed`);
for (const failure of failures) {
  console.log(`  ✗ ${failure.file} > ${failure.name}`);
  console.log(`    ${failure.error.stack ?? failure.error.message}`);
}
process.exit(failures.length === 0 ? 0 : 1);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }
    if (!entry.name.endsWith(".test.mjs")) continue;
    await runModule(fullPath);
  }
}

async function runModule(path) {
  const mod = await import(pathToFileURL(path).href);
  const tests = mod.default ?? [];
  for (const test of tests) {
    try {
      await test.fn();
      console.log(`  ✓ ${path.replace(`${ROOT}/`, "")} > ${test.name}`);
      passed += 1;
    } catch (error) {
      failures.push({ file: path.replace(`${ROOT}/`, ""), name: test.name, error });
    }
  }
}
