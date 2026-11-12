# 流式语音翻译实施任务

## 任务规则

- 每项任务使用格式：`- [ ] T001 [P?] [US?] 描述（准确仓库路径）`
- 每项任务必须引用来源 Intent、Specification 场景、Contract 或技术决策。
- 测试任务必须位于对应生产实现任务之前。
- CI、部署、Independent QA、UAT、发布、Review 和 Merge 结果属于下游平台证据。

## 依赖关系

- 两个用户故事均未获指定优先级；实施顺序按技术前置关系安排为 Setup → Foundational → US2 → US1 → Polish。
- T001 → T002；T001 与 T002 完成后，T003、T004 可并行。
- Foundational 阶段先执行 T005 至 T008；T009 依赖 T005、T006，T010 依赖 T005、T007，T011 依赖 T005、T008，T012 依赖 T009 至 T011。
- US2 的测试 T013 至 T015 依赖 T012；生产实现 T016 依赖 T013、T014，T017 依赖 T013、T015、T016。
- US1 的测试 T018 至 T022 依赖 T012、T017；生产实现 T023 依赖 T018、T019，T024 依赖 T018、T020、T023，T025 依赖 T019、T020、T023、T024，T026 依赖 T021、T022、T025。
- Polish 阶段 T027 依赖 T003、T026；T028 依赖 T004、T026；T029 依赖 T002、T013 至 T15、T018 至 T022、T027、T028。

## Phase 1：Setup

- [ ] T001 建立 Node.js 22 单 workspace 的锁定依赖、脚本和 clean-runner 安装入口，纳入 React 19、Vite、Fastify 5、Speech SDK、Azure Identity、Vitest、Playwright、ESLint 与 TypeScript，并以 `npm ci` 可重复安装作为完成证据（`package.json`、`package-lock.json`；来源：TD-001、TD-009、TD-010；依赖：无）
- [ ] T002 配置 TypeScript strict、ESLint 和 Vite 的浏览器/服务端构建边界，使静态分析与 build 命令可在无 Azure 配置时执行并产生 `dist/client`、`dist/server`（`tsconfig.json`、`eslint.config.js`、`vite.config.ts`；来源：TD-001、TD-010、Verification Environment；依赖：T001）
- [ ] T003 [P] 创建仅挂载 React 应用入口的 HTML shell，不加入语言选择、登录、历史或导出控件，并以 Vite build 解析入口成功作为证据（`index.html`；来源：TD-001、Component 边界；依赖：T002）
- [ ] T004 [P] 配置仓库忽略规则，排除依赖、构建、coverage、Playwright 输出、编辑器输出及全部 `.env*`，不得写入 secret（`.gitignore`；来源：Component 边界与项目结构、TD-010；依赖：T002）

## Phase 2：Foundational

- [ ] T005 [P] 先编写 WebSocket v1 schema、严格 sequence、固定 PCM 参数、未知字段拒绝及字幕事件结构的定向单元测试，并以 Vitest 全部断言通过或在实现前明确失败作为 test-first 证据（`tests/unit/schemas.test.ts`；来源：浏览器 WebSocket Contract、TD-003；依赖：T002）
- [ ] T006 [P] 先编写 connected/streaming/draining/ended 转换、非法转换、`audio.end` drain 与关闭清理的定向单元测试，并以 Vitest 状态断言作为证据（`tests/unit/state-machine.test.ts`；来源：数据流、状态、并发与生命周期；依赖：T002）
- [ ] T007 [P] 先编写启动配置 allowlist、必填值、candidate locale 去重校验及客户端不暴露 Azure 配置的定向单元测试，并以无 Azure 凭据的 Vitest 结果作为证据（`tests/unit/config.test.ts`；来源：配置、可观测性与运维、TD-004；依赖：T002）
- [ ] T008 [P] 先编写 adapter interface、会话模型、ordinal/revision 不变量和内容不进入结构化日志的类型与单元测试，并以 TypeScript/Vitest 结果作为证据（`tests/unit/session-model.test.ts`；来源：领域与数据模型、版本兼容性与 adapter 义务、Constitution 安全条款；依赖：T002）
- [ ] T009 实现版本化 wire 类型与封闭 schema，精确校验控制事件、UUID、sequence、PCM metadata、640-byte 帧配对及稳定无内容错误码，使 T005 通过（`src/shared/protocol.ts`、`src/shared/schemas.ts`；来源：浏览器 WebSocket Contract、TD-003；依赖：T005、T006）
- [ ] T010 实现环境配置一次性校验及 adapter TypeScript interface，隔离 browser/server 配置并禁止生产 adapter 被客户端参数切换，使 T007、T008 通过（`src/server/config.ts`、`src/server/adapters/types.ts`；来源：配置、可观测性与运维、版本兼容性与 adapter 义务；依赖：T005、T007、T008）
- [ ] T011 实现每连接状态机及会话内存模型，保证状态、客户端/服务端 sequence、ordinal、revision 和关闭清理不变量，使 T006、T008 通过（`src/server/session/state-machine.ts`；来源：领域与数据模型、数据流与生命周期；依赖：T005、T006、T008）
- [ ] T012 实现不访问 Azure 的 `/healthz`、JSON 无内容日志边界和 Fastify 生命周期基础入口，并以配置通过时 200、shutdown 时 503 及日志字段测试通过作为证据（`src/server/health.ts`、`src/server/index.ts`；来源：配置、可观测性与运维、Verification Environment；依赖：T009、T010、T011）

## Phase 3：US2 - 无需预设输入语言即可获得翻译

### 测试

- [ ] T013 [P] [US2] 先编写 Speech adapter 的 fixed PCM、continuous recognition/LID、候选 locale allowlist、`NoMatch` 无 segment、cancellation 重建及后续继续识别的定向单元测试，并以 synthetic SDK 事件的 Vitest 结果作为辅助证据（`tests/unit/azure-speech.test.ts`；来源：US-002、FR-002、FR-005、AC-001、Azure Speech adapter Contract；依赖：T012）
- [ ] T014 [P] [US2] 先编写可由 Independent QA 在精确 Candidate 上启用的真实 Speech contract/integration 自动化，验证 managed identity、固定 PCM、continuous LID、完整候选集合逐语言 locale 与连续输入；本地默认明确 skip 且不读取 Azure 配置，以测试发现和静态检查通过作为 Coding 完成证据，真实结果留给下游（`tests/contract/azure-speech.remote.test.ts`；来源：Azure Speech adapter Contract、IQA-002、Verification Environment；依赖：T012）
- [ ] T015 [P] [US2] 先编写无源语言字段的浏览器 functional 场景，以虚拟音频和 synthetic server 证明直接开始后显示识别 locale 对应的简体中文字幕，并保存输入、事件和 UI 对应断言（`tests/functional/automatic-language-detection.spec.ts`、`tests/functional/support/synthetic-server.ts`；来源：IQA-002、AC-001、AC-002、Quickstart 3；依赖：T012）

### 实现

- [ ] T016 [US2] 实现 Azure Speech PushAudioInputStream adapter，使用 16 kHz/16-bit/mono PCM、continuous recognition 与 continuous LID，仅输出候选集合内非空 final segment，并在取消后重建 recognizer 而不重放音频，使 T013 通过（`src/server/adapters/azure-speech.ts`；来源：FR-002、FR-005、TD-003、TD-004、Azure Speech adapter Contract；依赖：T013、T014）
- [ ] T017 [US2] 实现同源 WebSocket client 的 v1 协商与 `session.start`，协议及 UI 不提供源语言字段，严格应用递增 server sequence 与 revision，并使 T015 的自动检测场景通过（`src/client/api/translation-socket.ts`；来源：US-002、FR-002、AC-001、浏览器 WebSocket Contract；依赖：T013、T015、T016）

## Phase 4：US1 - 在外语发言期间阅读中文字幕

### 测试

- [ ] T018 [P] [US1] 先编写 translation coordinator 的 FIFO、累计 partial 替换、唯一 final、segment error 隔离、首次输出前一次 429/5xx retry、drain 和内容释放单元测试，并以 Vitest 的 ordinal/revision/sequence 断言作为证据（`tests/unit/coordinator.test.ts`；来源：FR-003、FR-004、FR-005、TD-005、领域不变量；依赖：T012、T017）
- [ ] T019 [P] [US1] 先编写 Foundry adapter 请求与事件解析单元测试，断言固定简体中文 instruction、`stream: true`、`reasoning.effort: "none"`、文本增量累积，以及 tool/reasoning/空输出拒绝且不记录内容（`tests/unit/foundry-translation.test.ts`；来源：FR-003、AC-002、Azure AI Foundry translation adapter Contract；依赖：T012、T017）
- [ ] T020 [P] [US1] 先编写 WebSocket 本地 contract 测试，覆盖 origin/subprotocol、状态、sequence、metadata/binary 配对、640-byte 帧、`audio.end` drain、稳定 `protocol.error` 与不回显内容（`tests/contract/websocket-v1.test.ts`；来源：FR-001、浏览器 WebSocket Contract、Quickstart 3；依赖：T012、T017）
- [ ] T021 [P] [US1] 先编写可由 Independent QA 在精确 Candidate 上启用的真实 Foundry contract/integration 自动化，验证配置 deployment 接受关闭 reasoning、无 reasoning、流式中文输出且无 fallback；本地默认明确 skip 且不读取 Azure 配置，以测试发现和静态检查通过作为 Coding 完成证据，真实结果留给下游（`tests/contract/foundry-translation.remote.test.ts`；来源：Azure AI Foundry translation adapter Contract、IQA-001、Verification Environment；依赖：T012、T017）
- [ ] T022 [P] [US1] 先编写浏览器 functional/end-to-end 辅助场景：在 `audio.end` 前按 ordinal 显示至少两个字幕、静音阶段不生成字幕而后续恢复、单片段失败后下一片段继续，并记录输入阶段、结束边界及 UI 事件顺序（`tests/functional/streaming-subtitles.spec.ts`、`tests/functional/silence-recovery.spec.ts`；来源：IQA-001、IQA-003、AC-003、AC-004、Quickstart 3；依赖：T012、T017）

### 实现

- [ ] T023 [US1] 实现 Foundry Responses streaming adapter，使用 managed identity token、固定中文翻译指令和关闭 reasoning 参数，只消费文本增量/completed，执行批准的一次 retry 并将 provider 失败映射为无内容类别，使 T019 通过（`src/server/adapters/foundry-translation.ts`；来源：FR-003、TD-006、Azure AI Foundry translation adapter Contract；依赖：T018、T019、T021）
- [ ] T024 [US1] 实现每会话唯一 FIFO translation coordinator，串行处理 final STT segment、输出累计 partial/唯一 final、隔离 error、保持静音等待并在队列排空后结束，使 T018 通过（`src/server/session/coordinator.ts`；来源：FR-003、FR-004、FR-005、TD-005、数据流与生命周期；依赖：T018、T020、T023）
- [ ] T025 [US1] 实现 Fastify WebSocket upgrade 与每连接 handler，执行同源、subprotocol、schema、帧配对、sequence、状态和生命周期校验，连接 Speech/translation adapter 并在断开或 shutdown 时清理，使 T020 通过（`src/server/websocket/handler.ts`、`src/server/index.ts`；来源：FR-001、FR-004、浏览器 WebSocket Contract、TD-002；依赖：T019、T020、T023、T024）
- [ ] T026 [US1] 实现用户手势麦克风采集、AudioWorklet PCM 重采样/20 ms 分帧、开始/停止流程和按 ordinal/revision 以 React text node 渲染当前会话字幕，释放音频节点并使 T015、T022 通过（`src/client/audio/pcm-worklet.ts`、`src/client/components/SubtitleView.tsx`、`src/client/App.tsx`、`src/client/main.tsx`；来源：US-001、FR-001、FR-004、FR-005、AC-003、AC-004、Component 边界；依赖：T021、T022、T025）

## Phase 5：Polish

- [ ] T027 [P] 创建多阶段 Node.js 22 Linux OCI 构建，以 `npm ci` 构建并裁剪 production dependencies，使用非 root 用户监听 3000，排除源码测试证据、`.env` 与 `.ai-delivery`，并以本地 image build、用户检查及 `/healthz` 结果作为 Coding 证据（`Dockerfile`、`.dockerignore`；来源：TD-007、部署拓扑、Production candidate 治理；依赖：T003、T026）
- [ ] T028 [P] 创建 active Feature 部署契约，声明 container port、health path、WebSocket、managed identity、非秘密配置引用与 secret 引用规则、Candidate 关联字段、幂等 `developerSetupCommands`，以及仅含非空 `staticAnalysis`、`build`、`developerTests` 和实际可本地执行的 `functionalTests` 分类命令；不得填入最终 SHA、digest、target 或凭据（`.ai-delivery/features/003-delivery-dlv-20261112-62ad2488e7c4/runtime/deployment.json`；来源：Technical Context 治理约束、部署拓扑、Quickstart；依赖：T004、T026）
- [ ] T029 执行 deployment contract 声明的 clean-runner setup 与 `staticAnalysis`、`build`、`developerTests`、`functionalTests`，随后构建并本地启动 OCI image 重放 health 和 synthetic functional 场景；保存原始命令、stdout/stderr 与退出码，首次失败即停止，扫描受控文件与 image 不含 secret/客户内容，真实 Azure contract、远程功能和 Candidate 身份证据明确留给平台与 Independent QA（`package.json`、`package-lock.json`、`Dockerfile`、`.ai-delivery/features/003-delivery-dlv-20261112-62ad2488e7c4/runtime/deployment.json`；来源：Quickstart 1-4、Verification Environment、Constitution；依赖：T002、T013、T014、T015、T018、T019、T020、T021、T022、T027、T028）

## 完成证据

- Setup 与 Foundational：锁定依赖可通过 `npm ci` 安装；静态分析和 build 在 clean workspace 且无 Azure 凭据时可重放；基础 Vitest 明确证明协议、配置、状态与内容隔离。
- US2：T013 与 T015 提供 synthetic 辅助证据；T014 提供真实 Speech contract/integration 的可执行入口、完整候选语言输入与证据格式，但真实 Azure 结果由部署后的精确 Candidate 在 Independent QA 产生。
- US1：T018 至 T020、T022 提供协议、翻译顺序、流式 UI、静音恢复和错误隔离的本地辅助证据；T021 提供真实 Foundry contract/integration 的可执行入口，但不得以 synthetic、health 或 build 结果替代 IQA-001 至 IQA-003。
- Production candidate readiness：根目录 `Dockerfile` 与 active Feature 的 `runtime/deployment.json` 可供平台在 clean runner 重放、构建同一 Candidate image 并执行下游门禁；Coding 不填造最终 commit SHA、registry digest、远程 target、QA、UAT、审批、Review 或 Merge 结果。
