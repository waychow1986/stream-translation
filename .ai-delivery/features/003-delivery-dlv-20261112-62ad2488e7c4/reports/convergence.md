# Coding 后 Convergence 报告

## Candidate 与证据范围

- Active Feature：`.ai-delivery/features/003-delivery-dlv-20261112-62ad2488e7c4`
- Delivery：`DLV-20261112-62AD2488E7C4`
- 已复核 Constitution、全部批准制品和门禁、technical baseline、实现、测试、实施报告、Dockerfile、deployment contract 与 functional script。
- CI、image publication、远程部署、Independent QA、UAT、审批、Review 与 Merge 尚未发生，不参与阻塞判定。

## 结论

`Repair Required`

上一轮四个阻塞项均已修复，但外部音频 fixture 的 JSON Schema 与运行时校验器、示例 manifest 相互矛盾，平台尚不能按统一 contract 准备 IQA-003 输入。

## 问题摘要

### CRITICAL

无。

### HIGH

1. **CONV-005（contradicts / coding-repair）**：`manifest.schema.json` 要求 `silence` 携带源文本和预期中文，却禁止 `after-silence` 携带这些字段；运行时校验器和示例 manifest 的要求正好相反。

### MEDIUM

1. `FoundryTranslationAdapter` 对 429/5xx retry 固定等待 `0` ms，未落实 `design.md` 的合法 `Retry-After` 约束；不影响已批准产品行为或必需验收入口，本轮不阻塞。

### LOW

无。

## 制品到实现与测试的可追溯关系

| 来源 | 实现路径 | 测试/证据路径 | 结论 |
|---|---|---|---|
| FR-001 / T028 / T036 / T038 | `src/client/audio/pcm-worklet.ts`、`src/client/App.tsx`、`src/server/websocket/handler.ts` | `tests/contract/websocket-v1.test.ts`、`tests/functional/streaming-subtitles.spec.ts` | 浏览器采音、PCM、WebSocket 与 UI 链路存在 |
| FR-002 / AC-001 / T018-T025 | `src/server/adapters/azure-speech.ts` | `tests/contract/azure-speech.remote.test.ts`、`tests/functional/automatic-language-detection.spec.ts`、`tests/functional/remote/iqa-002.spec.ts` | 逐 fixture locale 绑定及无语言选择浏览器证据已闭合 |
| FR-003 / AC-002 / T027 / T029 / T034 | `src/server/adapters/foundry-translation.ts` | `tests/unit/foundry-translation.test.ts`、`tests/contract/foundry-translation.remote.test.ts` | reasoning-off 中文流式入口存在 |
| FR-004 / AC-003 / IQA-001 / T030-T031 | `src/server/session/coordinator.ts`、`src/client/components/SubtitleView.tsx` | `tests/functional/streaming-subtitles.spec.ts`、`tests/functional/remote/iqa-001.spec.ts` | 单一持续 fixture 的有序多段证据入口已闭合 |
| FR-005 / AC-004 / IQA-003 / T020 / T030-T032 | `src/server/session/coordinator.ts` | `tests/functional/silence-recovery.spec.ts`、`tests/functional/remote/iqa-003.spec.ts`、`tests/functional/fixtures/manifest.schema.json` | 行为测试已闭合，fixture schema 存在 CONV-005 |
| OCI / runtime / T039-T042 | `Dockerfile`、`runtime/deployment.json`、`runtime/developer-functional-run.sh`、`/candidate-identity` | `reports/implementation.md` | 下游就绪制品存在 |

## 开发者验证独立复核

- deployment contract 声明 `npm ci`、Chromium 安装，以及非空、非 no-op 的 `staticAnalysis`、`build`、`developerTests`、`functionalTests`。
- 实施报告最后一轮记录 static analysis、build、54 项 Vitest、12 项本地 contract、4 项本地 Playwright functional、4 项 remote-readiness 断言及依赖扫描均退出码 0；真实 Azure 和三个 remote IQA 按职责 skip。
- 静态复核确认上一轮缺口已修复：Speech 逐 fixture 绑定 locale；IQA-001 使用单一持续 fixture 的可区分语义段；IQA-003 按语义归因；自动识别与静音恢复均经过 React App、fake microphone、AudioWorklet、WebSocket 和 `SubtitleView`。
- 上述本地证据不冒充真实 Azure 验收；现有测试未验证 checked-in JSON Schema 与运行时 contract 一致。

## 用户可见行为比较

实现保留自动语言识别、简体中文翻译、发言结束前开始输出、后续有序字幕及静音后继续处理。未发现语言选择、登录、历史、导出、持久化或会议平台集成。CONV-005 不改变运行时行为，但会阻止平台可靠准备 IQA-003 输入。

## 架构、Contract、运维与任务覆盖

实现符合批准的 Node.js/TypeScript、React/Vite、Fastify/WebSocket、Azure Speech、Foundry、managed identity 和单 OCI 容器拓扑。Dockerfile 使用非 root 用户，Candidate identity、health、WebSocket、配置及 functional script 均存在。未发现无来源的外部产品、数据库、队列、telemetry backend、告警或保留策略。CONV-005 已由 T020、T041 负责，路由为 `coding-repair`。

## 延后平台证据

以下未来事实不阻塞 Convergence：CI clean-runner 结果、integrated Candidate SHA、registry digest、部署 target/revision、managed identity/RBAC、真实 Speech/Foundry contract、完整语言交集、三个 IQA 结果、UAT、发布审批、Review 与 Merge。

## 阻塞项

### CONV-005 IQA-003 fixture JSON Schema 与运行时 contract 矛盾

- **严重性：** `HIGH`
- **分类：** `contradicts`
- **来源制品：** `design.md` Verification Environment、Quickstart 5-6；`tasks-implementation.md` T020、T041
- **实现或证据路径：** `tests/functional/fixtures/manifest.schema.json`、`tests/functional/fixtures/manifest.example.json`、`tests/functional/support/audio-fixture-bundle.ts`
- **修复路由：** `coding-repair`
- **所需证据：** schema 对两个 speech 阶段均要求非空源文本和预期中文，对 silence 禁止内容字段；example 同时通过 JSON Schema 与运行时校验，并有自动化测试在两者分歧时失败。

## 警告与剩余风险

- 真实 Azure、完整语言交集、managed identity/RBAC 和 IQA 结果必须由下游产生。
- 合法 `Retry-After` 尚未落实，作为非阻塞技术偏差保留。
- 未发现 secret、客户内容日志、未经请求行为或其他路由问题。

## 最终判定依据

上一轮 `CONV-001` 至 `CONV-004` 已闭合。当前 1 个 HIGH 阻塞项使必需 IQA-003 输入无法按统一 contract 准备和验证，故结果为 `Repair Required`；由现有任务返回 Coding 修复，不追加任务。
