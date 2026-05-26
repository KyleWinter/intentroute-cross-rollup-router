import { appendIntentEvent } from "./store.mjs";
import {
  castSend,
  deployerAddress,
  encodeCalldata,
  ensureAllowance,
  ensureBalance,
  envIdToDeploymentKey,
  keccakIntentId,
  loadDeployments,
  toBaseUnits,
  tokenSymbol
} from "./chain-client.mjs";
import { nowIso, seededUnitInterval } from "./utils.mjs";

function decideFailure(record, route) {
  const forced = record.intent?.forceOutcome;
  if (forced === "failure") return true;
  if (forced === "success") return false;
  return seededUnitInterval(`${record.id}:outcome`) > route.successProbability;
}

// Runs each intent through the real escrow + vault + registry contracts on
// the four local Anvil chains launched by scripts/start-chains.sh.
//
// Lifecycle (mirrors the in-memory simulator):
//   deposit on origin → mark submitted → vault fill on destination →
//   mark filled → mark settled (or mark failed → refund).

export async function startExecutionOnChain(record) {
  try {
    const deployments = await loadDeployments();
    const origin = deployments.chains.origin;
    if (!origin) throw new Error("origin chain not deployed");

    const route = record.selectedRoute;
    const destinationKey = envIdToDeploymentKey(route.environmentId);
    const destination = deployments.chains[destinationKey];
    if (!destination) throw new Error(`destination ${destinationKey} not deployed`);

    const symbol = tokenSymbol(record.intent);
    const amountWei = toBaseUnits(record.intent.amountIn, symbol);
    const recipient = record.intent.recipient;
    const intentBytes32 = await keccakIntentId(record.id);

    // 1. Make sure the depositor (== local deployer) has enough tokens and
    //    has approved the escrow.
    await ensureBalance(deployments, "origin", symbol, deployerAddress(), amountWei);
    await ensureAllowance(
      deployments,
      "origin",
      symbol,
      deployerAddress(),
      origin.contracts.IntentEscrow,
      amountWei
    );

    // 2. Deposit on the origin chain. This anchors the intent on-chain.
    const depositReceipt = await castSend(
      origin.rpc,
      origin.contracts.IntentEscrow,
      "depositIntent(bytes32,address,uint256,uint256,uint256)",
      [
        intentBytes32,
        origin.tokens[symbol],
        amountWei,
        String(record.intent.sourceChainId),
        String(destination.chainId)
      ]
    );
    appendIntentEvent(record.id, {
      status: "escrowed",
      note: `Deposit on-chain tx ${shortHash(depositReceipt.txHash)} (block ${depositReceipt.blockNumber})`,
      at: nowIso(),
      txHash: depositReceipt.txHash,
      chain: "origin",
      gasUsed: depositReceipt.gasUsed
    });

    // 3. Schedule the lifecycle, mirroring the timing in the in-memory simulator.
    const lifecycleMs = clampLifecycle(route.estimatedLatencyMs);
    const willFail = decideFailure(record, route);

    setTimeout(() => runMarkStep(record, origin, intentBytes32, "submitted", "markSubmitted(bytes32)"), 400);

    setTimeout(async () => {
      try {
        const fillReceipt = await fillOnDestination({
          destination,
          destinationKey,
          symbol,
          intent: record.intent,
          intentBytes32,
          recipient,
          amountWei,
          environmentName: route.environmentName
        });
        appendIntentEvent(record.id, {
          status: "filled-destination",
          note: fillReceipt.note,
          at: nowIso(),
          txHash: fillReceipt.txHash,
          chain: destinationKey,
          gasUsed: fillReceipt.gasUsed
        });
        await runMarkStep(record, origin, intentBytes32, "filled", "markFilled(bytes32)");
      } catch (error) {
        await markFailureAndRefund(record, origin, intentBytes32, `vault fill failed: ${error.message}`);
      }
    }, Math.round(lifecycleMs * 0.45));

    if (willFail) {
      setTimeout(
        () => markFailureAndRefund(record, origin, intentBytes32, "simulated settlement risk hit"),
        Math.round(lifecycleMs * 0.78)
      );
      return;
    }

    setTimeout(
      () => runMarkStep(record, origin, intentBytes32, "settled", "markSettled(bytes32)"),
      Math.round(lifecycleMs * 0.85)
    );
  } catch (error) {
    appendIntentEvent(record.id, {
      status: "failed",
      note: `On-chain execution aborted: ${error.message}`,
      at: nowIso()
    });
  }
}

async function fillOnDestination({
  destination,
  destinationKey,
  symbol,
  intent,
  intentBytes32,
  recipient,
  amountWei,
  environmentName
}) {
  const token = destination.tokens[symbol];

  if (intent.intentType === "transfer_and_execute" && intent.executionTarget) {
    const target =
      intent.executionTarget.toLowerCase() === "auto"
        ? destination.contracts.PaymentReceiver
        : intent.executionTarget;
    if (!target) {
      throw new Error("transfer_and_execute requires executionTarget or a deployed PaymentReceiver");
    }
    const refHex = "0x" + Buffer.from("intentroute-prototype").toString("hex").padEnd(64, "0");
    const payload = intent.executionPayload && intent.executionPayload.startsWith("0x")
      ? intent.executionPayload
      : await encodeCalldata("acknowledge(bytes32,address,uint256,bytes32)", [
          intentBytes32,
          recipient,
          amountWei,
          refHex
        ]);

    const receipt = await castSend(
      destination.rpc,
      destination.contracts.DestinationVault,
      "recordFillAndExecute(bytes32,address,address,uint256,address,bytes)",
      [intentBytes32, token, recipient, amountWei, target, payload]
    );
    return {
      ...receipt,
      note: `Vault fill + execute on ${environmentName} tx ${shortHash(receipt.txHash)} (gas ${receipt.gasUsed}, target ${shortHash(target)})`
    };
  }

  const receipt = await castSend(
    destination.rpc,
    destination.contracts.DestinationVault,
    "recordFill(bytes32,address,address,uint256)",
    [intentBytes32, token, recipient, amountWei]
  );
  return {
    ...receipt,
    note: `Vault fill on ${environmentName} tx ${shortHash(receipt.txHash)} (gas ${receipt.gasUsed})`
  };
}

async function runMarkStep(record, origin, intentBytes32, status, signature) {
  try {
    const receipt = await castSend(origin.rpc, origin.contracts.IntentEscrow, signature, [
      intentBytes32
    ]);
    appendIntentEvent(record.id, {
      status,
      note: `Escrow ${status} tx ${shortHash(receipt.txHash)} (gas ${receipt.gasUsed})`,
      at: nowIso(),
      txHash: receipt.txHash,
      chain: "origin",
      gasUsed: receipt.gasUsed
    });
  } catch (error) {
    appendIntentEvent(record.id, {
      status: "failed",
      note: `Mark ${status} failed: ${error.message}`,
      at: nowIso()
    });
  }
}

async function markFailureAndRefund(record, origin, intentBytes32, reason) {
  try {
    const failReceipt = await castSend(
      origin.rpc,
      origin.contracts.IntentEscrow,
      "markFailed(bytes32)",
      [intentBytes32]
    );
    appendIntentEvent(record.id, {
      status: "failed",
      note: `Marked failed (${reason}) tx ${shortHash(failReceipt.txHash)}`,
      at: nowIso(),
      txHash: failReceipt.txHash,
      chain: "origin",
      gasUsed: failReceipt.gasUsed
    });

    const refundReceipt = await castSend(
      origin.rpc,
      origin.contracts.IntentEscrow,
      "refund(bytes32)",
      [intentBytes32]
    );
    appendIntentEvent(record.id, {
      status: "refunded",
      note: `Escrow refunded to depositor tx ${shortHash(refundReceipt.txHash)}`,
      at: nowIso(),
      txHash: refundReceipt.txHash,
      chain: "origin",
      gasUsed: refundReceipt.gasUsed
    });
  } catch (error) {
    appendIntentEvent(record.id, {
      status: "failed",
      note: `Refund path failed: ${error.message}`,
      at: nowIso()
    });
  }
}

function clampLifecycle(estimatedMs) {
  return Math.max(2000, Math.min(8000, estimatedMs));
}

function shortHash(hash) {
  if (!hash) return "?";
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}
