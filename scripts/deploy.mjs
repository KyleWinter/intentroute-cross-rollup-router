#!/usr/bin/env node
// Deploy contracts to the four local Anvil chains launched by start-chains.sh
// and write resulting addresses to data/deployments.json so the backend can
// pick them up.
//
// Layout:
//   origin (9000):  MockERC20, SettlementRegistry, IntentEscrow
//   each dest:      MockERC20, DestinationVault
//
// Uses `forge create` so we get ABI encoding, gas estimation, and solc
// resolution for free.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data");
const SOLC_PATH =
  process.env.LOCAL_SOLC_PATH ??
  join(homedir(), ".solc-select", "artifacts", "solc-0.7.4", "solc-0.7.4");

// Anvil's first dev account. Public, well-known. Safe for local-only.
const DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DEPLOYER_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const CHAINS = [
  { id: "origin", chainId: 9000, port: 8545 },
  { id: "fast-rollup", chainId: 9101, port: 8546 },
  { id: "cheap-rollup", chainId: 9102, port: 8547 },
  { id: "congested-rollup", chainId: 9103, port: 8548 }
];

const TOKENS = [
  { symbol: "mUSDC", name: "Mock USDC", decimals: 6 },
  { symbol: "mETH", name: "Mock Ether", decimals: 18 }
];

if (!existsSync(SOLC_PATH)) {
  console.error(`solc 0.7.4 not found at ${SOLC_PATH}. Set LOCAL_SOLC_PATH.`);
  process.exit(1);
}

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

async function main() {
  const deployments = {
    deployer: DEPLOYER_ADDRESS,
    chains: {}
  };

  // Origin chain: tokens + registry + escrow.
  const origin = CHAINS[0];
  const originRpc = rpcUrl(origin.port);
  await waitForChain(originRpc, origin.id);

  console.log(`\n[${origin.id}] deploying tokens, registry, escrow`);
  const originRecord = {
    chainId: origin.chainId,
    rpc: originRpc,
    role: "origin",
    tokens: {},
    contracts: {}
  };

  for (const token of TOKENS) {
    const address = await forgeCreate(
      "contracts/src/MockERC20.sol:MockERC20",
      originRpc,
      [token.name, token.symbol, String(token.decimals)]
    );
    originRecord.tokens[token.symbol] = address;
    console.log(`  token ${token.symbol} @ ${address}`);
  }

  const registryAddress = await forgeCreate(
    "contracts/src/SettlementRegistry.sol:SettlementRegistry",
    originRpc,
    []
  );
  console.log(`  SettlementRegistry @ ${registryAddress}`);
  originRecord.contracts.SettlementRegistry = registryAddress;

  const escrowAddress = await forgeCreate(
    "contracts/src/IntentEscrow.sol:IntentEscrow",
    originRpc,
    [registryAddress]
  );
  console.log(`  IntentEscrow @ ${escrowAddress}`);
  originRecord.contracts.IntentEscrow = escrowAddress;

  // Wire registry → escrow.
  await castSend(originRpc, registryAddress, "setEscrowContract(address)", [escrowAddress]);
  console.log("  registry.setEscrowContract done");

  deployments.chains[origin.id] = originRecord;

  // Destination chains: tokens + vault.
  for (const chain of CHAINS.slice(1)) {
    const rpc = rpcUrl(chain.port);
    await waitForChain(rpc, chain.id);

    console.log(`\n[${chain.id}] deploying tokens and vault`);
    const record = {
      chainId: chain.chainId,
      rpc,
      role: "destination",
      tokens: {},
      contracts: {}
    };

    for (const token of TOKENS) {
      const address = await forgeCreate(
        "contracts/src/MockERC20.sol:MockERC20",
        rpc,
        [token.name, token.symbol, String(token.decimals)]
      );
      record.tokens[token.symbol] = address;
      console.log(`  token ${token.symbol} @ ${address}`);

      // Pre-fund the vault deployer so the relayer can transfer on fill.
      await castSend(rpc, address, "mint(address,uint256)", [
        DEPLOYER_ADDRESS,
        "1000000000000000000000000"
      ]);
    }

    const vaultAddress = await forgeCreate(
      "contracts/src/DestinationVault.sol:DestinationVault",
      rpc,
      []
    );
    console.log(`  DestinationVault @ ${vaultAddress}`);
    record.contracts.DestinationVault = vaultAddress;

    const receiverAddress = await forgeCreate(
      "contracts/src/PaymentReceiver.sol:PaymentReceiver",
      rpc,
      []
    );
    console.log(`  PaymentReceiver @ ${receiverAddress}`);
    record.contracts.PaymentReceiver = receiverAddress;

    // Seed the vault with both tokens so it can fill intents.
    for (const token of TOKENS) {
      await castSend(rpc, record.tokens[token.symbol], "transfer(address,uint256)", [
        vaultAddress,
        "500000000000000000000000"
      ]);
    }

    deployments.chains[chain.id] = record;
  }

  const outPath = join(DATA_DIR, "deployments.json");
  await writeFile(outPath, JSON.stringify(deployments, null, 2), "utf8");
  console.log(`\nDeployments written to ${outPath}`);
}

function rpcUrl(port) {
  return `http://127.0.0.1:${port}`;
}

async function waitForChain(rpc, label, maxAttempts = 20) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] })
      });
      if (response.ok) {
        return;
      }
    } catch (_) {
      // ignore
    }
    await sleep(250);
  }
  throw new Error(`Chain ${label} at ${rpc} did not respond. Did you run start-chains.sh?`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function forgeCreate(target, rpc, args) {
  return new Promise((resolve, reject) => {
    const cliArgs = [
      "create",
      target,
      "--rpc-url",
      rpc,
      "--private-key",
      DEPLOYER_KEY,
      "--use",
      SOLC_PATH,
      "--offline",
      "--broadcast"
    ];

    if (args.length > 0) {
      cliArgs.push("--constructor-args", ...args);
    }

    const child = spawn("forge", cliArgs, { cwd: ROOT });
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
        reject(new Error(`forge create failed for ${target}\n${stderr || stdout}`));
        return;
      }
      const match = stdout.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/);
      if (!match) {
        reject(new Error(`could not parse deployed address for ${target}\n${stdout}`));
        return;
      }
      resolve(match[1]);
    });
  });
}

function castSend(rpc, to, signature, args) {
  return new Promise((resolve, reject) => {
    const cliArgs = [
      "send",
      "--rpc-url",
      rpc,
      "--private-key",
      DEPLOYER_KEY,
      to,
      signature,
      ...args
    ];

    const child = spawn("cast", cliArgs, { cwd: ROOT });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`cast send ${signature} failed\n${stderr}`));
        return;
      }
      resolve();
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
