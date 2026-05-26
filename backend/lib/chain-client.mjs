import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DEPLOYMENTS_PATH = join(__dirname, "..", "..", "data", "deployments.json");

// First anvil dev account. Public, well-known; safe for local-only execution.
const DEPLOYER_KEY =
  process.env.DEPLOYER_KEY ?? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DEPLOYER_ADDRESS =
  process.env.DEPLOYER_ADDRESS ?? "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const ENV_TO_CHAIN_ID = {
  "fast-rollup": "fast-rollup",
  "cheap-rollup": "cheap-rollup",
  "congested-rollup": "congested-rollup"
};

const TOKEN_DECIMALS = { mUSDC: 6, mETH: 18, USDC: 6, ETH: 18 };
const TOKEN_KEY = { USDC: "mUSDC", ETH: "mETH", mUSDC: "mUSDC", mETH: "mETH" };

let cached;

export async function loadDeployments() {
  if (cached) return cached;
  if (!existsSync(DEPLOYMENTS_PATH)) {
    throw new Error(
      `Deployments file not found at ${DEPLOYMENTS_PATH}. Run npm run chains:start && npm run chains:deploy first.`
    );
  }
  const raw = await readFile(DEPLOYMENTS_PATH, "utf8");
  cached = JSON.parse(raw);
  return cached;
}

export function deployerAddress() {
  return DEPLOYER_ADDRESS;
}

// Serialize transactions per RPC endpoint so nonces never collide. `cast send`
// waits for receipt, so chaining promises is enough — no manual nonce mgmt.
const chainQueues = new Map();
function enqueueOnChain(rpc, fn) {
  const prev = chainQueues.get(rpc) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  chainQueues.set(
    rpc,
    next.catch(() => {})
  );
  return next;
}

export async function castSend(rpc, to, signature, args = []) {
  return enqueueOnChain(rpc, () =>
    runCast([
      "send",
      "--rpc-url",
      rpc,
      "--private-key",
      DEPLOYER_KEY,
      "--json",
      to,
      signature,
      ...args.map(String)
    ])
  ).then((stdout) => parseSendReceipt(stdout));
}

export async function castCall(rpc, to, signature, args = []) {
  return runCast([
    "call",
    "--rpc-url",
    rpc,
    to,
    signature,
    ...args.map(String)
  ]).then((stdout) => stdout.trim());
}

function runCast(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("cast", args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`cast ${args[0]} failed: ${stderr || stdout}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function parseSendReceipt(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    return {
      txHash: parsed.transactionHash,
      blockNumber:
        typeof parsed.blockNumber === "string"
          ? Number.parseInt(parsed.blockNumber, 16)
          : parsed.blockNumber,
      gasUsed:
        typeof parsed.gasUsed === "string"
          ? Number.parseInt(parsed.gasUsed, 16)
          : parsed.gasUsed,
      status: parsed.status === "0x1" || parsed.status === 1 ? "success" : "failed"
    };
  } catch (_) {
    return { txHash: stdout.trim().split("\n").pop(), status: "unknown" };
  }
}

export async function keccakIntentId(idString) {
  const stdout = await runCast(["keccak", idString]);
  return stdout.trim();
}

export async function encodeCalldata(signature, args) {
  const stdout = await runCast(["calldata", signature, ...args.map(String)]);
  return stdout.trim();
}

export function tokenSymbol(intent) {
  return TOKEN_KEY[intent.tokenIn] ?? TOKEN_KEY[intent.tokenOut] ?? "mUSDC";
}

export function toBaseUnits(amount, symbol) {
  const decimals = TOKEN_DECIMALS[symbol] ?? 6;
  // amount is a JS Number from intent payload; bump to base units via BigInt.
  const whole = BigInt(Math.trunc(amount));
  const factor = 10n ** BigInt(decimals);
  return (whole * factor).toString();
}

export function envIdToDeploymentKey(environmentId) {
  return ENV_TO_CHAIN_ID[environmentId] ?? environmentId;
}

export async function ensureBalance(deployments, chainKey, symbol, target, amountWei) {
  const chain = deployments.chains[chainKey];
  if (!chain) throw new Error(`unknown chain key ${chainKey}`);
  const tokenAddress = chain.tokens[symbol];
  if (!tokenAddress) throw new Error(`token ${symbol} not deployed on ${chainKey}`);

  const balanceHex = await castCall(chain.rpc, tokenAddress, "balanceOf(address)(uint256)", [target]);
  const balance = parseUintFromCast(balanceHex);
  if (balance >= BigInt(amountWei)) {
    return { minted: false, balance: balance.toString() };
  }

  await castSend(chain.rpc, tokenAddress, "mint(address,uint256)", [target, amountWei]);
  return { minted: true, balance: amountWei };
}

function parseUintFromCast(value) {
  const trimmed = value.trim().split(/\s+/)[0];
  if (trimmed.startsWith("0x")) {
    return BigInt(trimmed);
  }
  return BigInt(trimmed);
}

export async function ensureAllowance(deployments, chainKey, symbol, owner, spender, amountWei) {
  const chain = deployments.chains[chainKey];
  const tokenAddress = chain.tokens[symbol];
  const current = parseUintFromCast(
    await castCall(chain.rpc, tokenAddress, "allowance(address,address)(uint256)", [owner, spender])
  );
  if (current >= BigInt(amountWei)) return;
  // approve max so subsequent intents reuse the allowance.
  await castSend(chain.rpc, tokenAddress, "approve(address,uint256)", [
    spender,
    "115792089237316195423570985008687907853269984665640564039457584007913129639935"
  ]);
}
