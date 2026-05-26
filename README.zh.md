# IntentRoute

> 面向 **SC6109 Option 6: Cross-Rollup Intent Router for Scalable User Transactions** 的可解释跨 Rollup 意图路由器。

用户只描述"我要什么结果"，IntentRoute 根据费用、延迟、拥堵和预测成功率自动选择最合适的目标 Rollup，并把整个生命周期锚定到链上。同一份原型支持两种运行模式：

- **模拟模式**——零依赖单 Node 进程，适合跑基准与快速演示
- **链上模式**——本地起 4 个 Anvil，跑真实的 `IntentEscrow` / `DestinationVault` / `SettlementRegistry` 合约，真实 tx hash + gas 计量

还附带一个精简版 ERC-4337 智能账户层（[`SmartAccount.sol`](contracts/src/SmartAccount.sol) + [`IntentEntryPoint.sol`](contracts/src/IntentEntryPoint.sol)），用来演示 Account Abstraction 如何与 Intent 路由组合。

English version: [README.md](README.md)

---

## 功能特性

- **意图驱动的提交**——`transfer` / `transfer_and_execute` / `swap`（带按环境差异化的 mock AMM 价格 + 流动性深度）
- **多因子路由**：四个预设（`balanced` / `cheapest` / `fastest` / `reliable`）+ `custom` 自定义权重
- **三个模拟 Rollup**（FastRollup / CheapRollup / CongestedRollup），种子化场景扰动（`normal` / `burst` / `stress`）
- **链上结算**：`IntentEscrow`、`SettlementRegistry`、`DestinationVault`（含 merchant 路径用的 `recordFillAndExecute`）、`PaymentReceiver`
- **ERC-4337 智能账户**：ECDSA 所有者、chainId-binding 防跨链重放、bad-sig 不消耗 nonce、批量 `handleOps`
- **可解释的路由决策**——每个选中路由附带 2-3 条原因和每因子效用拆解
- **强制结果开关**：`forceOutcome: auto | success | failure`，演示时可确定性地触发 refund 路径
- **基准矩阵**：3 个场景 × 4 个 workload × 7 个策略，输出 Markdown 报告 + JSON 快照，前端有实验面板
- **聚合 Pareto 图**：费用 vs p95 延迟散点图 + 自动识别 Pareto 前沿
- **CI**：GitHub Actions 跑后端测试、基准可复现性、Foundry 测试

---

## 仓库结构

```text
backend/                Node HTTP 服务、路由器、模拟器、链上客户端
  lib/
    intent-schema.mjs   意图校验、自定义权重、forceOutcome
    router.mjs          加权多因子打分 + 解释
    environments.mjs    三个 Rollup 配置 + 场景 / swap 定价
    simulator.mjs       内存模式与链上模式的分发器
    onchain-simulator.mjs   真链上生命周期（cast 子进程 + 队列）
    chain-client.mjs    零依赖 JSON-RPC 封装
    store.mjs           内存中的意图记录
contracts/              Foundry 工程（solc 0.7.4）
  src/
    IntentEscrow.sol           源链托管
    SettlementRegistry.sol     全局生命周期注册表
    DestinationVault.sol       fill + transfer_and_execute
    PaymentReceiver.sol        merchant 风格的执行目标
    MockERC20.sol              测试代币
    SmartAccount.sol           ERC-4337 风格智能账户
    IntentEntryPoint.sol       精简版 EntryPoint
  test/                14 个 Foundry 测试，分 4 套（escrow / vault / registry / smart account）
data/                   基准输出 + 部署地址 + anvil 日志 + 自动下载的 solc
docs/                   分析与设计文档（见下方）
experiments/run-benchmark.mjs   可复现的基准 runner
frontend/               静态 HTML/CSS/JS，由后端托管
scripts/
  run-all.sh            一键启动脚本，附带 doctor + 自动下载 solc
  start-chains.sh       拉起 4 个 Anvil（8545-8548 / chainId 9000-9103）
  stop-chains.sh        停止它们
  deploy.mjs            forge create + cast 接线，地址写入 data/deployments.json
  run-tests.mjs         后端单元测试 runner
  forge-local.mjs       用本地 solc 0.7.4 包装 forge build/test
.github/workflows/ci.yml  三 job 的 CI
myfiles/                项目笔记（交付清单、待办板、演示脚本）
```

---

## 快速上手

环境要求：
- **Node.js ≥ 18** —— 必装
- **[Foundry](https://book.getfoundry.sh/)** —— 链上模式才需要
- **solc 0.7.4** —— 链上模式才需要；启动脚本可以自动下载

### 一行命令搞定

```bash
npm run doctor          # 检查依赖，缺哪个就提示装哪个
npm run install-solc    # 自动下载 solc 0.7.4（如果还没装）
npm start               # 拉链 + 部署合约 + 链上模式启动后端
npm stop                # 一键停掉所有 anvil 和 backend
```

[scripts/run-all.sh](scripts/run-all.sh) 是幂等的：再跑一次 `npm start` 会跳过已经在跑的部分（anvil、合约），只补缺失的那段。合约地址是确定性部署的，所以 `data/deployments.json` 在多次重启之间都稳定有效——只要链没被重置。

### npm 脚本速查

| 脚本 | 作用 |
|---|---|
| `npm start` | 一键链上模式（拉链 + 部署 + 后端） |
| `npm run start:simulated` | 仅启后端，无需 Foundry / solc |
| `npm stop` | 干净拆掉链和后端 |
| `npm run doctor` | 依赖体检 |
| `npm run install-solc` | 自动把 solc 0.7.4 下到 `data/solc/` |
| `npm test` | 后端单元测试（24 个） |
| `npm run forge:test` | Foundry 合约测试（14 个） |
| `npm run benchmark` / `:sample` | 跑 12-cell 基准矩阵（`:sample` 同时写出 JSON + Markdown） |
| `npm run chains:start` / `:stop` / `:deploy` | 手动控制链上栈 |

### 模拟模式（无需 Foundry / solc）

```bash
npm run start:simulated
# 或：npm run dev
# 浏览器打开 http://localhost:3100
```

前端覆盖意图提交、路由预览、生命周期时间线和实验面板。基准快照已经提交在 `data/` 下，开箱即用。

### 链上模式（4 个本地 Anvil）

推荐用 `npm start`，它会替你完成下面所有步骤。手动指令保留下来便于调试与透明：

```bash
npm run chains:start            # 4 个 Anvil，端口 8545-8548，chainId 9000-9103
npm run chains:deploy           # 在每条链上 forge create，地址写入 data/deployments.json
ONCHAIN_MODE=1 npm run dev      # 后端通过 cast 子进程跟链交互
npm run chains:stop             # 拆 anvil
```

链上模式下前端 mode banner 变绿，时间线上每个事件都带真实 tx hash、chain 标签和 gas 消耗。典型生命周期 gas：deposit ~320k → submit/fill/settle 各 49k → vault fill ~150k（`transfer_and_execute` 路径约 250k）。

### 演示流程

[myfiles/演示流程.md](myfiles/演示流程.md) 是一份精确到秒的 10 分钟演示脚本，每一节都标注它对应 PDF 里 Option 6 的哪条 Feature Requirement / Hint，方便评审者按打分点对照。

### 跑基准

```bash
npm run benchmark           # 输出到 stdout
npm run benchmark:sample    # 同时把 JSON + Markdown 报告写入 data/
```

产物：
- `data/benchmark-sample.json` — 首页摘要卡数据
- `data/benchmark-expanded.json` — 实验面板用的完整 12-cell 矩阵
- `data/benchmark-report.md` — 可扩展性分析文档引用的 Markdown 报告

### 跑测试

```bash
npm test               # 24 个后端单元测试
npm run forge:test     # 14 个 Foundry 测试，自动定位 solc 0.7.4
```

基准 + 两套测试都接入了 CI（[.github/workflows/ci.yml](.github/workflows/ci.yml)），每次 push 都会跑。

---

## 文档

项目的"推理过程"都写在 `docs/` 下，这部分与代码同等重要：

- [architecture.md](docs/architecture.md) — 系统组件、生命周期时序、信任面（8 张 mermaid 图）
- [option6_requirements_plan.md](docs/option6_requirements_plan.md) — 最初的需求分析与项目计划
- [scalability_analysis.md](docs/scalability_analysis.md) — 可扩展性论证、方法论、对 4 个研究问题的实证回答
- [trust_and_decentralization.md](docs/trust_and_decentralization.md) — 5 actor 信任模型、6 类信任假设分级、3 Tier 缓解路线图
- [privacy_tradeoffs.md](docs/privacy_tradeoffs.md) — 当前系统泄露什么、MEV / 时序风险、4 类缓解方案与对应参考系统
- [erc4337_integration.md](docs/erc4337_integration.md) — Account Abstraction 与 Intent 为何互补、本项目实现了什么、刻意省略了什么
- [erc7683_mapping.md](docs/erc7683_mapping.md) — 当前 schema 到草案 ERC-7683 跨链意图标准的逐字段映射
- [testnet_deployment.md](docs/testnet_deployment.md) — 如何把同一套脚本指向 Sepolia / Optimism Sepolia / Base Sepolia / Arbitrum Sepolia

评审用补充资料：
- [myfiles/演示流程.md](myfiles/演示流程.md) — 精确到秒的 10 分钟演示脚本，每节都对照 PDF 的 Feature Requirement / Hint
- [myfiles/项目说明.md](myfiles/项目说明.md) — 中文版项目说明
- [myfiles/待办事项.md](myfiles/待办事项.md) — 对照 PDF 的差距分析与逐项交付状态

---

## 架构（一段话讲完）

用户签发一个"以结果为中心"的意图。链下路由器对三个候选 Rollup 在费用 / 延迟 / 拥堵 / 可靠性四个维度上打分——使用预设偏好或用户自定义权重——返回带解释的路由选择。资金被锁入源链上的 `IntentEscrow`。Relayer 推进生命周期：先 `markSubmitted`，再在目标链上调用 `DestinationVault.recordFill`（或 merchant 路径用 `recordFillAndExecute`，附带回调到 `PaymentReceiver`），再 `markFilled` 和 `markSettled`（或失败路径 `markFailed` + `refund`）。每一步状态都映射到 `SettlementRegistry`，前端可以看到完整历史。开启 ERC-4337 模式后，用户签发的是一条 `UserOperation`，其 `callData` 就是 `IntentEscrow.depositIntent`；bundler 通过 `IntentEntryPoint.handleOps` 提交并支付 gas。

---

## 本项目**不**主张什么

- 不主张提升基础链 TPS。本项目主张的可扩展性发生在**用户接入层**：在 Rollup 生态碎片化的同时让每个用户的 UX 保持稳定
- 不是生产级安全。结算 owner 是单 EOA；`onlyOwner` 的 refund 是当前唯一 load-bearing 的信任假设（在 [trust_and_decentralization.md](docs/trust_and_decentralization.md) 中已记录并给出 Tier-1 缓解方案）
- 没有接入真实测试网。用 3 个模拟环境 + 4 个本地 Anvil 顶替
- 不是 ERC-4337 完整实现（没有 paymaster、`initCode`、bundler 验证规则）——但集成"做实了"：测试套件里能用智能账户端到端签发并执行真正的 `depositIntent`

---

## 课程信息

- SC6109（南洋理工大学），Option 6
- 提交截止：2026 年 5 月 31 日 23:59
- 团队上限 5 人，每组只需一名成员提交
