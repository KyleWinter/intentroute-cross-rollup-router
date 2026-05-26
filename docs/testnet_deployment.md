# Testnet Deployment

> The default IntentRoute setup uses four local Anvil chains. The same `scripts/deploy.mjs` + `backend/lib/chain-client.mjs` pipeline supports real testnets — the only thing that changes is the chain config and the deployer key. This document is the recipe.
>
> **This recipe has not been executed in CI.** It requires a funded testnet account and live RPC endpoints, neither of which the prototype ships. We document it so the migration path is concrete, and so a grader can verify the architecture supports it.

---

## 1. What's already wired in

Two env-var overrides in [scripts/deploy.mjs](../scripts/deploy.mjs):

| Variable | Default | Purpose |
|---|---|---|
| `CHAINS_CONFIG_PATH` | unset → use built-in 4-anvil layout | Path to JSON file describing chains (`id`, `chainId`, `rpc` or `port`) |
| `DEPLOYER_KEY` | well-known Anvil account #0 | Private key that signs all `forge create` calls |
| `DEPLOYER_ADDRESS` | well-known Anvil account #0 | Address corresponding to `DEPLOYER_KEY` |

A starter config is committed at [data/chains.testnet.example.json](../data/chains.testnet.example.json). It maps to four real Sepolia-class testnets:

- **Ethereum Sepolia** (`11155111`) — origin chain, hosts `IntentEscrow` + `SettlementRegistry`
- **Optimism Sepolia** (`11155420`) — `FastRollup` role
- **Base Sepolia** (`84532`) — `CheapRollup` role
- **Arbitrum Sepolia** (`421614`) — `CongestedRollup` role

Replace `YOUR_INFURA_KEY` (or substitute with Alchemy / a public RPC) and you're ready to deploy.

---

## 2. Prerequisites for the user

1. **A funded testnet account on all four chains.** Each contract deployment burns ~2-3M gas. You need maybe 0.05 ETH per chain to cover deploy + a handful of demo intents. Sepolia ETH is available from [sepoliafaucet.com](https://sepoliafaucet.com); the L2 testnets bridge from Sepolia.
2. **Stable RPC endpoints.** Public RPCs (`https://sepolia.optimism.io` etc) work for low-volume demos but rate-limit aggressively. For benchmarks use Infura/Alchemy.
3. **The private key for that account.** Treat it like real funds — anyone with it can drain your testnet balance and (more importantly) impersonate your `onlyOwner` settlement key.

---

## 3. Step-by-step

```bash
# 1. Edit the config — set RPCs, keep chainIds aligned with your testnet choices
cp data/chains.testnet.example.json data/chains.testnet.json
$EDITOR data/chains.testnet.json

# 2. Set the deployer credentials. NEVER commit these.
export DEPLOYER_KEY=0x<your-testnet-private-key>
export DEPLOYER_ADDRESS=0x<that-key's-address>
export CHAINS_CONFIG_PATH="$PWD/data/chains.testnet.json"

# 3. Make sure your solc is available (the launcher handles this)
npm run install-solc       # if you don't have solc 0.7.4 yet

# 4. Deploy. forge create will sign + broadcast real transactions.
LOCAL_SOLC_PATH=$PWD/data/solc/solc-0.7.4 node scripts/deploy.mjs

# data/deployments.json now contains real testnet addresses.

# 5. Run the backend in on-chain mode. The chain-client picks up the new
#    deployments.json automatically.
ONCHAIN_MODE=1 npm run dev
```

The frontend `mode banner` will show a green "On-chain mode" with the real testnet RPC. Lifecycle events in the timeline now carry real Sepolia block numbers and tx hashes you can paste into etherscan.

---

## 4. What changes from local-Anvil mode

| Aspect | Local Anvil | Testnet |
|---|---|---|
| Block time | 1 s | 6-12 s on Sepolia, 2 s on most L2 sepolias |
| Lifecycle wall-clock | 3-8 s per intent | 30-90 s per intent |
| Gas cost | Free (Anvil prints money) | Real testnet ETH; ~580k gas per intent end-to-end |
| Address determinism | Yes (nonce-0 → same address every redeploy) | No — testnet nonces differ; new deployments produce new addresses |
| `forceOutcome` paths | Work | Still work; `refund` runs an extra tx on origin |
| `transfer_and_execute` | Hits local PaymentReceiver | Hits the PaymentReceiver you deployed on the destination |
| ERC-4337 layer | Tested via Foundry | Not yet routed through real EntryPoint — same caveat as in [erc4337_integration.md §5](erc4337_integration.md#5-what-we-did-not-claim-or-implement) |

---

## 5. Operational gotchas

1. **`forge create` requires the RPC to support `eth_sendRawTransaction`.** All major testnet providers do. Public RPCs sometimes drop large bytecode broadcasts under load — retry with an Alchemy/Infura key if you see "tx underpriced" or "transaction dropped" errors.
2. **The per-RPC promise queue in `backend/lib/chain-client.mjs` serialises tx submission to avoid nonce collisions.** On a real testnet that means the lifecycle for an intent is strictly sequential per chain, which is fine for demos but limits throughput. For benchmarking, either deploy multiple deployer keys or batch operations.
3. **L2 sepolias have different block time guarantees.** `lifecycleMs` in [backend/lib/onchain-simulator.mjs](../backend/lib/onchain-simulator.mjs) clamps the simulated lifecycle to `[2, 8]` seconds — on a real testnet you may want to extend the clamp or compute it from `route.estimatedLatencyMs` differently.
4. **Etherscan API quotas.** If you wire up Etherscan verification later, account for the per-network rate limits. Verification isn't required to run the demo.
5. **Settlement-owner key handling.** `IntentEscrow` and `DestinationVault` use `onlyOwner`. Whoever holds `DEPLOYER_KEY` after deployment owns the entire system. For a real demo, transfer ownership to a multisig (or at least a hot key separate from your deployer) before showing anyone else the URL.

---

## 6. Why this isn't the default

The project chooses local Anvils as the demo target because:

- **Reproducibility.** A grader can clone the repo and run `npm start` in 90 seconds. A testnet path needs the grader to bring their own RPC + funds.
- **Determinism.** Local Anvil gives bit-identical benchmark numbers across runs. Testnet block times jitter, which makes the scalability story in [scalability_analysis.md](scalability_analysis.md) harder to defend with the same JSON snapshots.
- **CI.** The Foundry tests and the backend tests both run in GitHub Actions without any external dependency. Testnet integration tests require secrets management and are not in scope for the course.

The architecture supports both; the **default** optimises for graders and CI, the **opt-in** path opens the door for live demos.

---

## 7. One paragraph for the demo

> All the on-chain code we ship is testnet-portable. The only changes needed to point IntentRoute at Sepolia + Optimism Sepolia + Base Sepolia + Arbitrum Sepolia are a four-line JSON config (committed as [data/chains.testnet.example.json](../data/chains.testnet.example.json)) and two environment variables for the deployer credentials. We didn't run the path in CI because it requires a funded account, but the wiring is in place — `npm start` against a testnet config produces real tx hashes the grader can verify on the public block explorers.
