# Coding 后 Convergence 报告

## Candidate 与证据范围

- Active Feature：`.ai-delivery/features/003-delivery-dlv-20261112-62ad2488e7c4`
- Delivery：`DLV-20261112-62AD2488E7C4`
- 本轮重新核对上一轮 4 个阻塞项，并检查 Constitution、全部已批准 Markdown 制品、通过的阶段门禁、technical baseline、当前实现与测试、`reports/implementation.md`、`Dockerfile`、`runtime/deployment.json` 和 functional script。
- CI、image publication、远程部署、Independent QA、UAT、发布审批、Review 与 Merge 尚未发生；这些未来结果不参与本轮阻塞判定。

## 结论

`Repair Required`

上一轮真实 Azure 调用入口、浏览器链路和证据落盘缺口已有实质修复，但复核发现 4 个仍可独立复现的测试证据缺口。当前入口可能在未证明逐语言识别、同一持续发言的后续字幕或静音后真实恢复时通过，且两项 Coding functional 场景仍未执行浏览器用户链路。

## 问题摘要

### CRITICAL

无。

### HIGH

1. **CONV-001（test-gap / coding-repair）**：Speech contract 与 IQA-002 只比较“观察到的 locale 集合”和候选集合，没有断言每个 fixture 的实际 locale 等于其声明 locale；locale 互换仍可通过，无法证明完整候选集合逐语言自动识别。
2. **CONV-002（test-gap / coding-repair）**：IQA-001 的“两条字幕”可来自不同 fixture、不同浏览器和不同会话；fixture contract 也未强制该场景引用连续内容及至少两个可区分内容段，因此不能证明同一持续发言中后续内容继续有序产生字幕。
3. **CONV-003（test-gap / coding-repair）**：IQA-003 以字幕到达时的已发送帧数推断字幕属于哪个输入阶段。Azure 识别和翻译异步延迟会把静音前字幕归到静音或静音后，也会让旧字幕错误满足“恢复”；fixture 又没有逐阶段源文本和预期中文，故不能证明中段无虚构输出及后段恢复。

### MEDIUM

1. **CONV-004（test-gap / coding-repair，阻塞）**：`automatic-language-detection.spec.ts` 与 `silence-recovery.spec.ts` 仍从 Node 直接调用 `TranslationSocket`，没有加载 `App`、麦克风、AudioWorklet 或 `SubtitleView`。这不满足 T022/T030 已批准的浏览器 functional 辅助测试，也没有 Coding 环境中的用户可见自动识别与静音恢复证据。

### LOW

无。

## 制品到实现与测试的可追溯关系

| 来源 | 实现路径 | 测试/证据路径 | 结论 |
|---|---|---|---|
| FR-001 / T028 / T036 / T038 | `src/client/audio/pcm-worklet.ts`、`src/client/App.tsx`、`src/server/websocket/handler.ts` | `tests/contract/websocket-v1.test.ts`、`tests/functional/streaming-subtitles.spec.ts` | 协议及浏览器流式链路存在 |
| FR-002 / AC-001 / T018-T025 | `src/server/adapters/azure-speech.ts`、`src/client/api/translation-socket.ts` | `tests/contract/azure-speech.remote.test.ts`、`tests/functional/remote/iqa-002.spec.ts` | 真实入口存在；逐 fixture locale 证据缺失，见 CONV-001 |
| FR-003 / AC-002 / T027 / T029 / T034 | `src/server/adapters/foundry-translation.ts` | `tests/unit/foundry-translation.test.ts`、`tests/contract/foundry-translation.remote.test.ts` | reasoning-off、真实调用及中文 streaming 入口已闭合 |
| FR-004 / AC-003 / IQA-001 / T030-T031 | `src/server/session/coordinator.ts`、`src/client/components/SubtitleView.tsx` | `tests/functional/streaming-subtitles.spec.ts`、`tests/functional/remote/iqa-001.spec.ts` | 本地浏览器辅助场景存在；远程持续发言判定不足，见 CONV-002 |
| FR-005 / AC-004 / IQA-003 / T030-T031 | `src/server/adapters/azure-speech.ts`、`src/server/session/coordinator.ts` | `tests/functional/silence-recovery.spec.ts`、`tests/functional/remote/iqa-003.spec.ts` | 阶段归因及本地浏览器证据不足，见 CONV-003、CONV-004 |
| OCI / runtime / T039-T042 | `Dockerfile`、`runtime/deployment.json`、`runtime/developer-functional-run.sh`、`/candidate-identity` | implementation report 最后一节 | 就绪制品存在；脚本现执行真实 contract/IQA 并保全结构化结果 |

## 开发者验证独立复核

- `runtime/deployment.json` 声明 `npm ci`、Chromium 安装及唯一分类的 `staticAnalysis`、`build`、`developerTests`、`functionalTests`；命令非空且未发现 no-op。
- `reports/implementation.md` 最后一节记录：static analysis、build、54 项 Vitest 断言、12 项本地 contract、4 项本地 functional、remote readiness、runtime 语法/失败边界及依赖扫描均退出码 0；真实 Azure contract 和 3 个 remote IQA 按职责明确 skip。
- 本轮静态复核确认 `streaming-subtitles.spec.ts` 已真实执行 Web app、fake microphone、AudioWorklet、WebSocket 与 `SubtitleView`，且 functional script 不再生成固定场景摘要，而是校验并嵌入实际 JSON。
- 本轮没有重新执行命令，也不把 Coding 报告、Mock、build、health 或 skip 结果解释为真实 Azure 验收通过。CONV-001 至 CONV-004 表明当前通过记录仍未覆盖全部已批准的可判定证据。

## 用户可见行为比较

- 生产实现保留自动语言识别、中文翻译、字幕有序输出、短暂无可识别内容后继续及当前会话 UI；未发现语言选择、登录、历史、导出、持久化或其他未请求能力。
- 本地浏览器场景证明两条 synthetic 中文字幕在停止输入前可见。
- 现有远程断言尚不能把识别 locale 和具体输入逐项关联，也不能把字幕可靠关联到静音前后源内容；因此 AC-001、AC-003、AC-004 的真实环境结果仍不可独立判定。

## 架构、Contract、运维与任务覆盖

- 实现采用批准的 Node.js/TypeScript、React/Vite、Fastify/WebSocket、Azure Speech、Foundry、managed identity 和单 OCI 容器拓扑；production composition root 为每个连接创建独立 adapter。
- `Dockerfile` 以非 root 用户运行；deployment contract、health、Candidate identity、WebSocket、managed identity、配置引用和下游 functional script 均存在。
- 未发现无批准来源的数据库、队列、身份产品、外部 telemetry/logging backend、告警、保留策略或运维依赖。
- CONV-001 至 CONV-004 分别由现有 T020、T021、T022、T023、T030、T031、T032、T041、T042 覆盖，均属于现有任务实现或证据不完整，修复路由为 `coding-repair`；不追加 Feature 任务。

## 延后平台证据

以下未来事实不构成本轮阻塞项：

- 平台 CI clean-runner 重放和最终 integrated Candidate SHA。
- registry image digest、Container Apps target/revision。
- managed identity/RBAC、真实 Speech/Foundry contract、完整候选语言交集及逐语言结果。
- IQA-001 至 IQA-003 的真实环境结果、UAT、发布审批、Review 与 Merge。

Convergence 只要求相应入口能够准确执行并产生可独立判定的证据；上述结果本身应由后续平台阶段产生。

## 阻塞项

### CONV-001 逐语言自动识别证据未与输入 fixture 绑定

- **严重性：** `HIGH`
- **分类：** `test-gap`
- **来源制品：** `design.md` Azure Speech adapter contract、Verification Environment；`spec.md` IQA-002；`tasks-implementation.md` T021、T023
- **实现或证据路径：** `tests/contract/azure-speech.remote.test.ts`、`tests/functional/remote/iqa-002.spec.ts`、`tests/functional/support/remote-candidate.ts`
- **修复路由：** `coding-repair`
- **所需证据：** 对每个 fixture 保存并断言声明 locale、实际识别 locale 和对应字幕；每项必须逐一相等且覆盖完整候选集合，locale 互换或错配必须失败。

### CONV-002 IQA-001 未证明同一持续发言的后续字幕

- **严重性：** `HIGH`
- **分类：** `test-gap`
- **来源制品：** `spec.md` IQA-001、AC-003；`design.md` Quickstart；`tasks-implementation.md` T020、T030、T031
- **实现或证据路径：** `tests/functional/fixtures/manifest.schema.json`、`tests/functional/support/audio-fixture-bundle.ts`、`tests/functional/support/remote-candidate.ts`、`tests/functional/remote/iqa-001.spec.ts`
- **修复路由：** `coding-repair`
- **所需证据：** IQA-001 fixture contract 明确同一持续输入中的至少两个可区分内容段；同一浏览器会话的证据关联各段、字幕、ordinal 和 `audio.end`，并证明首批字幕在结束前出现、后续内容继续按序输出。

### CONV-003 IQA-003 的静音与恢复归因不可判定

- **严重性：** `HIGH`
- **分类：** `test-gap`
- **来源制品：** `spec.md` IQA-003、AC-004；`design.md` Verification Environment；`tasks-implementation.md` T020、T031、T032
- **实现或证据路径：** `tests/functional/fixtures/manifest.schema.json`、`tests/functional/support/audio-fixture-bundle.ts`、`tests/functional/support/remote-candidate.ts`、`tests/functional/remote/iqa-003.spec.ts`
- **修复路由：** `coding-repair`
- **所需证据：** fixture contract 为静音前、静音、静音后定义可核对且不重叠的源内容/预期输出；证据按源内容关联字幕而非按异步到达时刻归因，证明静音没有对应虚构翻译且静音后的新内容产生新的正确字幕。

### CONV-004 两项 Coding functional 未执行浏览器用户链路

- **严重性：** `MEDIUM`
- **分类：** `test-gap`
- **来源制品：** `design.md` Verification Environment；`tasks-implementation.md` T022、T030、T038
- **实现或证据路径：** `tests/functional/automatic-language-detection.spec.ts`、`tests/functional/silence-recovery.spec.ts`
- **修复路由：** `coding-repair`
- **所需证据：** 两个 synthetic 辅助场景均由 Playwright 加载 Candidate Web app，经 fake microphone、AudioWorklet、WebSocket 和 `SubtitleView` 执行，并分别断言无语言选择的可见中文字幕以及静音无虚构字幕、后续可见恢复。

## 警告与剩余风险

- 真实 Azure 服务兼容性、完整语言交集、managed identity/RBAC 和真实翻译结果应由下游执行，不能用本地结果替代。
- `FoundryTranslationAdapter` 对 429/5xx 重试固定等待 `0` ms，未落实 `design.md` 所述“遵守合法 `Retry-After`”；鉴于 Specification 未批准重试或恢复时限，此项作为非阻塞 MEDIUM 技术偏差保留，但应由现有 T026/T034 的 Coding repair 一并核对。
- 未发现 secret、客户内容日志、未经请求行为或需要 `feature-task`、`clarification`、`platform-event` 的问题。

## 最终判定依据

当前有 3 个 HIGH 和 1 个实质性 MEDIUM 阻塞项，均使已批准 contract、IQA 或 Coding functional 证据不能独立证明要求行为，故结果为 `Repair Required`。上一轮已修复部分不再作为阻塞项；本轮仅保留仍未闭合的证据。所有阻塞项均由现有任务负责，返回 Coding 修复，不修改上游制品或任务。
