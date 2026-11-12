# Coding 后 Convergence 报告

## Candidate 与证据范围

- Active Feature：`.ai-delivery/features/003-delivery-dlv-20261112-62ad2488e7c4`
- Delivery：`DLV-20261112-62AD2488E7C4`
- 本轮重新检查上一轮 `CONV-001` 至 `CONV-004`，并核对 Constitution、全部已批准 Markdown 制品、通过的阶段门禁、technical baseline、实现、测试、`reports/implementation.md`、`Dockerfile`、deployment contract 与 functional script。
- CI、image publication、远程部署、Independent QA、UAT、发布审批、Review 与 Merge 尚未发生；这些未来结果不参与本轮阻塞判定。

## 结论

`Repair Required`

上一轮四个阻塞项均已有对应修复并取得 Coding 环境验证证据，但外部音频 fixture 的 checked-in JSON Schema 与实际校验器、示例 manifest 相互矛盾。该缺陷使平台无法依据同一 contract 准备 IQA-003 输入，所以下游真实验收入口尚未完全就绪。

## 问题摘要

### CRITICAL

无。

### HIGH

1. **CONV-005（contradicts / coding-repair）**：`manifest.schema.json` 把 `silence` 阶段的 `expectedSourceText`、`expectedChinese` 设为必填，却不允许 `after-silence` 阶段携带这两个字段；运行时校验器和示例 manifest 正好要求相反。示例不能通过其声明的 schema，符合运行时校验器的 IQA-003 bundle 也不能通过 checked-in contract。

### MEDIUM

1. `FoundryTranslationAdapter` 对 429/5xx 的一次 retry 仍固定等待 `0` ms，未落实 `design.md` 的合法 `Retry-After` 约束。该偏差不改变已批准产品行为，也不使当前必需测试或下游验收入口不可执行，本轮作为非阻塞技术警告保留。

### LOW

无。

## 制品到实现与测试的可追溯关系

| 来源 | 实现路径 | 测试/证据路径 | 结论 |
|---|---|---|---|
| FR-001 / T028 / T036 / T038 | `src/client/audio/pcm-worklet.ts`、`src/client/App.tsx`、`src/server/websocket/handler.ts` | `tests/contract/websocket-v1.test.ts`、`tests/functional/streaming-subtitles.spec.ts` | 浏览器采音、固定 PCM、WebSocket 与 UI 链路存在 |
| FR-002 / AC-001 / T018-T025 | `src/server/adapters/azure-speech.ts`、`src/client/api/translation-socket.ts` | `tests/contract/azure-speech.remote.test.ts`、`tests/functional/automatic-language-detection.spec.ts`、`tests/functional/remote/iqa-002.spec.ts` | 逐 fixture locale 绑定及无语言选择浏览器证据已闭合 |
| FR-003 / AC-002 / T027 / T029 / T034 | `src/server/adapters/foundry-translation.ts` | `tests/unit/foundry-translation.test.ts`、`tests/contract/foundry-translation.remote.test.ts` | reasoning-off、中文流式输出及真实 contract 入口存在 |
| FR-004 / AC-003 / IQA-001 / T030-T031 | `src/server/session/coordinator.ts`、`src/client/components/SubtitleView.tsx` | `tests/functional/streaming-subtitles.spec.ts`、`tests/functional/remote/iqa-001.spec.ts` | 同一持续 fixture 的多语义段、有序字幕和 `audio.end` 证据入口已闭合 |
| FR-005 / AC-004 / IQA-003 / T020 / T030-T032 | `src/server/adapters/azure-speech.ts`、`src/server/session/coordinator.ts` | `tests/functional/silence-recovery.spec.ts`、`tests/functional/remote/iqa-003.spec.ts`、`tests/functional/fixtures/manifest.schema.json` | 行为测试已闭合，但外部 fixture schema 自相矛盾，见 CONV-005 |
| OCI / runtime / T039-T042 | `Dockerfile`、`runtime/deployment.json`、`runtime/developer-functional-run.sh`、`/candidate-identity` | `reports/implementation.md` 最后两轮记录 | 生产容器、身份端点、分类命令和真实 functional 调用入口存在 |

## 开发者验证独立复核

- `runtime/deployment.json` 声明幂等 `npm ci` 与 Chromium 安装，并按 `staticAnalysis`、`build`、`developerTests`、`functionalTests` 分类提供非空、非 no-op 命令。
- `reports/implementation.md` 最后一轮记录：static analysis、build、54 项 Vitest 断言、12 项本地 contract、4 项本地 Playwright functional、4 项 remote-readiness 断言及依赖扫描均退出码 0；真实 Azure contract 与三个 remote IQA 按职责明确 skip。
- 静态独立复核确认上一轮四个阻塞点对应代码已改变：Speech 逐 fixture 绑定 locale；IQA-001 使用单一持续 fixture 和可区分语义段；IQA-003 按可区分语义归因；自动语言识别与静音恢复均经真实 React App、fake microphone、AudioWorklet、WebSocket 和 `SubtitleView`。
- 本轮未把 Coding 报告、Mock、build、health 或 skip 解释为真实 Azure 验收通过。CONV-005 表明当前通过记录没有验证 checked-in JSON Schema 与运行时 fixture contract 的一致性。

## 用户可见行为比较

- 当前实现保留自动语言识别、简体中文翻译、发言结束前开始输出、后续内容有序输出及短暂无可识别内容后的继续处理。
- 本地 Playwright 场景提供 Coding 负责的浏览器用户链路辅助证据；远程入口保留真实 Azure 上逐语言、持续字幕和静音恢复的可判定证据结构。
- 未发现语言选择、登录、历史、导出、持久化、会议平台集成或其他未请求行为。
- CONV-005 不直接改变运行时用户行为，但会阻止平台按唯一、无矛盾的输入 contract 准备并验证 IQA-003。

## 架构、Contract、运维与任务覆盖

- 实现采用批准的 Node.js/TypeScript、React/Vite、Fastify/WebSocket、Azure Speech、Foundry、managed identity 和单 OCI 容器拓扑。
- `Dockerfile` 使用非 root 用户；deployment contract、health、Candidate identity、WebSocket、managed identity、配置引用及下游 functional script 均存在。
- 未发现无批准来源的数据库、队列、身份产品、外部 telemetry/logging backend、告警、保留策略或运维依赖。
- CONV-005 属于现有 T020、T041 的 fixture contract 实施错误，修复路由为 `coding-repair`；不追加 Feature 任务。

## 延后平台证据

以下未来事实不构成本轮阻塞项：

- 平台 CI clean-runner 重放、最终 integrated Candidate SHA 和本地声明命令的 CI 结果。
- registry image digest、Container Apps target/revision。
- managed identity/RBAC、真实 Speech/Foundry contract、完整候选语言交集及逐语言结果。
- IQA-001 至 IQA-003 的真实环境结果、UAT、发布审批、Review 与 Merge。

Convergence 只检查这些阶段所需输入和执行入口是否就绪，不要求未来结果提前存在。

## 阻塞项

### CONV-005 IQA-003 fixture JSON Schema 与运行时 contract 矛盾

- **严重性：** `HIGH`
- **分类：** `contradicts`
- **来源制品：** `design.md` Verification Environment、Quickstart 5-6；`tasks-implementation.md` T020、T041
- **实现或证据路径：** `tests/functional/fixtures/manifest.schema.json`、`tests/functional/fixtures/manifest.example.json`、`tests/functional/support/audio-fixture-bundle.ts`
- **修复路由：** `coding-repair`
- **所需证据：** 使 schema 对 `before-silence` 和 `after-silence` 均要求非空源文本与预期中文，对 `silence` 禁止这些内容字段；证明 example manifest 同时通过 JSON Schema 和运行时校验，并增加能在两者再次分歧时失败的自动化 contract 测试。

## 警告与剩余风险

- 真实 Azure 服务兼容性、完整语言交集、managed identity/RBAC、实际翻译及远程 IQA 结果应由下游产生，不能用本地结果替代。
- retry 未遵守合法 `Retry-After` 的非阻塞技术偏差仍存在，应由现有 T026/T034 的 Coding repair 核对。
- 未发现 secret、客户内容日志、未经请求行为或需要 `feature-task`、`clarification`、`platform-event` 的问题。

## 最终判定依据

上一轮 `CONV-001` 至 `CONV-004` 已闭合，不再作为阻塞项。当前仍有 1 个 HIGH 阻塞项：IQA-003 的外部 fixture JSON Schema 与实际执行 contract 互相矛盾，导致必需下游验收输入无法按统一 contract 准备和验证。该问题由现有任务负责，返回 Coding 修复；本轮结果为 `Repair Required`。
