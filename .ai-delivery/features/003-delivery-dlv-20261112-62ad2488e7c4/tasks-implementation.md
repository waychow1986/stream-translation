# 流式语音翻译实施任务

## 任务规则

- 每项任务使用格式：`- [ ] T001 [P?] [US?] 描述（准确仓库路径）`
- 每项任务必须引用来源 Intent、Specification 场景、Contract 或技术决策。
- 测试任务必须位于对应生产实现任务之前。
- CI、部署、Independent QA、UAT、发布、Review 和 Merge 结果属于下游平台证据。

## 依赖关系

- 两个用户故事均未获指定优先级；实施顺序按技术前置关系安排为 Setup → Foundational → US2 → US1 → Polish。
- T001 → T002；T001 与 T002 完成后，T003、T004 可并行。
- Foundational 测试 T005 至 T011 依赖 T002；T012 依赖 T005、T006，T013 依赖 T005、T007、T008，T014 依赖 T006、T008，T015 依赖 T009，T016 依赖 T010、T012 至 T014，T017 依赖 T008、T011、T014、T016。
- US2 测试 T018 至 T023 依赖 T016、T017；其中 T020 可在 T002 后并行准备，T021 依赖 T020，T023 依赖 T020 至 T022；T024 依赖 T018、T019、T021，T025 依赖 T018、T022、T024。
- US1 测试 T026 至 T033 依赖 T017、T025；T031 额外依赖 T020、T023、T029、T030，T032 依赖 T023、T031，T033 依赖 T018、T027、T032。T034 依赖 T026、T027、T029，T035 依赖 T026、T028、T034，T036 依赖 T027、T028、T034、T035，T037 依赖 T024、T033、T034、T036，T038 依赖 T029 至 T031、T034 至 T036。
- Polish 阶段 T039 依赖 T003、T015、T037、T038；T040 依赖 T004、T017、T037、T038；T041 依赖 T020、T032、T038；T042 依赖 T039 至 T041。

## Phase 1：Setup

- [ ] T001 建立 Node.js 22 单 workspace 的锁定依赖、脚本和 clean-runner 安装入口，纳入 React 19、Vite、Fastify 5、Speech SDK、Azure Identity、Vitest、Playwright、ESLint 与 TypeScript，并以 `npm ci` 可重复安装作为完成证据（`package.json`、`package-lock.json`；来源：TD-001、TD-009、TD-010；依赖：无）
- [ ] T002 配置 TypeScript strict、ESLint 和 Vite 的浏览器/服务端构建边界，使静态分析与 build 命令可在无 Azure 配置时执行并产生 `dist/client`、`dist/server`（`tsconfig.json`、`eslint.config.js`、`vite.config.ts`；来源：TD-001、TD-010、Verification Environment；依赖：T001）
- [ ] T003 [P] 创建仅挂载 React 应用入口的 HTML shell，不加入语言选择、登录、历史或导出控件，并以 Vite build 解析入口成功作为证据（`index.html`；来源：TD-001、Component 边界；依赖：T002）
- [ ] T004 [P] 配置仓库忽略规则，排除依赖、构建、coverage、Playwright 输出、编辑器输出及全部 `.env*`，不得写入 secret（`.gitignore`；来源：Component 边界与项目结构、TD-010；依赖：T002）

## Phase 2：Foundational

- [ ] T005 [P] 先编写 WebSocket v1 schema、严格 sequence、固定 PCM 参数、未知字段拒绝及字幕事件结构的定向单元测试，并以 Vitest 全部断言通过或在实现前明确失败作为 test-first 证据（`tests/unit/schemas.test.ts`；来源：浏览器 WebSocket Contract、TD-003；依赖：T002）
- [ ] T006 [P] 先编写 connected/streaming/draining/ended 转换、非法转换、`audio.end` drain 与关闭清理的定向单元测试，并以 Vitest 状态断言作为证据（`tests/unit/state-machine.test.ts`；来源：数据流、状态、并发与生命周期；依赖：T002）
- [ ] T007 [P] 先编写启动配置 allowlist、必填值、candidate locale 去重校验及客户端不暴露 Azure 配置的定向单元测试，并以无 Azure 凭据的 Vitest 结果作为证据（`tests/unit/config.test.ts`；来源：配置、可观测性与运维、TD-004；依赖：T002）
- [ ] T008 [P] 先编写 adapter interface、会话模型、ordinal/revision 不变量、health shutdown 状态和内容不进入结构化日志的定向测试，并以 TypeScript/Vitest 结果作为证据（`tests/unit/session-model.test.ts`、`tests/unit/health.test.ts`、`tests/unit/logging.test.ts`；来源：领域与数据模型、版本兼容性与 adapter 义务、配置与可观测性、Constitution 安全条款；依赖：T002）
- [ ] T009 [P] 先编写 production build 静态文件提供 contract 测试，断言 `/` 与 client-side route 返回 `dist/client` 入口、静态 asset 可访问、`/healthz` 与 `/ws/v1/translate` 不被 fallback 覆盖，并保留实现前失败结果（`tests/contract/static-web.test.ts`；来源：Session gateway、数据流、部署拓扑；依赖：T002）
- [ ] T010 [P] 先编写 synthetic Speech/Translation adapters 与生产 interface 一致性、确定性事件、错误注入及 Fastify server-side dependency injection contract 测试，断言客户端参数和生产配置均不能切换 adapter（`tests/contract/synthetic-adapters.test.ts`；来源：TD-009、版本兼容性与 adapter 义务、Verification Environment；依赖：T002）
- [ ] T011 [P] 先编写进程生命周期 contract 与 image functional 场景，覆盖 SIGTERM 后 `/healthz` 返回 503、拒绝新 WebSocket、在途队列于 grace period 内 drain、超时后取消 provider 并关闭，保留实现前失败结果和确定性事件顺序（`tests/contract/lifecycle.test.ts`、`tests/functional/image-lifecycle.spec.ts`；来源：SLO、限制、扩缩容、重试与恢复，rollout、health、drain 与 rollback；依赖：T002）
- [ ] T012 实现版本化 wire 类型与封闭 schema，精确校验控制事件、UUID、sequence、PCM metadata、640-byte 帧配对及稳定无内容错误码，使 T005 通过（`src/shared/protocol.ts`、`src/shared/schemas.ts`；来源：浏览器 WebSocket Contract、TD-003；依赖：T005、T006）
- [ ] T013 实现环境配置一次性校验及 adapter TypeScript interface，隔离 browser/server 配置并禁止生产 adapter 被客户端参数切换，使 T007、T008 通过（`src/server/config.ts`、`src/server/adapters/types.ts`；来源：配置、可观测性与运维、版本兼容性与 adapter 义务；依赖：T005、T007、T008）
- [ ] T014 实现每连接状态机及会话内存模型，保证状态、客户端/服务端 sequence、ordinal、revision 和关闭清理不变量，使 T006、T008 通过（`src/server/session/state-machine.ts`；来源：领域与数据模型、数据流与生命周期；依赖：T006、T008）
- [ ] T015 实现 Fastify 对 `dist/client` 的静态 asset 提供和非 API client-side route 入口 fallback，同时保持 health 与 WebSocket 路径边界，使 T009 在 production build 上通过（`src/server/static-web.ts`、`src/server/index.ts`；来源：Session gateway、数据流、部署拓扑；依赖：T009）
- [ ] T016 实现可注入 adapter 的 Fastify app factory，并创建只由测试代码显式注入的 synthetic adapters、本地 server fixture 与只读挂载进 OCI image 后调用 image 内 `dist/server` app factory 的 harness；不得提供客户端、query 或生产环境变量切换入口，使 T010 通过（`src/server/app.ts`、`tests/functional/support/synthetic-adapters.ts`、`tests/functional/support/test-app.ts`、`tests/functional/support/image-candidate-server.mjs`；来源：TD-009、版本兼容性与 adapter 义务、Quickstart 2-4；依赖：T010、T012、T013、T014）
- [ ] T017 实现不访问 Azure 的 `/healthz`、JSON 无内容日志边界、SIGTERM 生命周期和 Fastify 启停入口：先置 503 并停止接受新连接，再在 grace period 内 drain，超时则取消 provider 和关闭连接，使 T008 与 T011 的 lifecycle contract 通过；image 场景留待 T042 重放（`src/server/health.ts`、`src/server/lifecycle.ts`、`src/server/index.ts`；来源：配置、可观测性与运维，SLO、限制、扩缩容、重试与恢复；依赖：T008、T011、T014、T016）

## Phase 3：US2 - 无需预设输入语言即可获得翻译

### 测试

- [ ] T018 [P] [US2] 先编写 Speech adapter 的 fixed PCM、continuous recognition/LID、候选 locale allowlist、`NoMatch` 无 segment、cancellation 重建及后续继续识别的定向单元测试，并以 synthetic SDK 事件的 Vitest 结果作为辅助证据（`tests/unit/azure-speech.test.ts`；来源：US-002、FR-002、FR-005、AC-001、Azure Speech adapter Contract；依赖：T016、T017）
- [ ] T019 [P] [US2] 先编写 Speech managed identity token 生命周期测试，断言 `DefaultAzureCredential` 使用 `https://cognitiveservices.azure.com/.default` 获取 token、在到期前刷新并更新 Speech configuration、获取或刷新失败不泄露 token 且可取消，并以假时钟和 credential test double 的失败后通过结果为证据（`tests/unit/azure-speech-token.test.ts`；来源：Azure Speech adapter Contract、Constitution managed identity 条款；依赖：T016、T017）
- [ ] T020 [P] [US2] 先定义并测试由 Independent QA 显式注入的外部非敏感音频 fixture bundle 输入 contract：以 bundle root 下的 manifest 声明测试生成或获准来源、16 kHz/16-bit/mono PCM 格式、相对音频路径、SHA-256、locale、连续内容、静音/不可识别间隔和 `audio.end` 边界；校验路径不得逃逸 bundle root，且运行时完整候选语言交集中的每个 locale 均有逐语言 fixture，IQA-001 与 IQA-003 场景引用完整，任何 manifest、文件、hash、格式、locale 或场景引用缺失均在联网前失败；以 checked-in schema、无音频的非敏感 example manifest 和本地 Vitest 正反例作为 Coding 证据，不提交真实会议内容（`tests/functional/fixtures/manifest.schema.json`、`tests/functional/fixtures/manifest.example.json`、`tests/functional/support/audio-fixture-bundle.ts`、`tests/functional/support/audio-fixture-bundle.test.ts`；来源：IQA-001 至 IQA-003、Azure Speech adapter Contract、Verification Environment、Quickstart 3、5-6；依赖：T002）
- [ ] T021 [P] [US2] 先编写可由 Independent QA 在精确 Candidate 上启用的真实 Speech contract/integration 自动化，通过 T020 的显式外部 fixture bundle contract 取得可核对流式音频，验证 managed identity、固定 PCM、continuous LID、完整候选集合逐语言 locale 与连续输入；fixture contract 校验后本地默认明确 skip 且不读取 Azure 配置，以测试发现、bundle 完整性正反例和静态检查通过作为 Coding 完成证据，真实 RBAC、endpoint 与音频执行结果留给下游（`tests/contract/azure-speech.remote.test.ts`、`tests/functional/support/audio-fixture-bundle.ts`；来源：Azure Speech adapter Contract、IQA-002、Verification Environment；依赖：T016、T017、T020）
- [ ] T022 [P] [US2] 先编写无源语言字段的浏览器 functional 场景，通过 Candidate Fastify app 的 test DI 注入虚拟音频和 synthetic adapters，证明直接开始后显示识别 locale 对应的简体中文字幕，并保存输入、协议事件和 UI 对应断言（`tests/functional/automatic-language-detection.spec.ts`；来源：IQA-002、AC-001、AC-002、Quickstart 3；依赖：T016、T017）
- [ ] T023 [US2] 先创建 Independent QA 可对已部署 Candidate 启用的 IQA-002 端到端入口：只接受显式 remote base URL 和通过 T020 校验的外部 fixture bundle，经 Candidate WebSocket 验证未预设语言、完整合格语言交集逐语言 locale 与中文字幕；证据记录日期、Candidate identity、target、fixture hash、输入阶段、server sequence/ordinal、locale 和字幕，缺少或不完整 bundle 必须在联网前失败，默认发现但 skip 且不读取 Azure endpoint/credential（`tests/functional/remote/iqa-002.spec.ts`、`tests/functional/support/remote-candidate.ts`、`tests/functional/support/iqa-evidence.ts`、`tests/functional/support/audio-fixture-bundle.ts`；来源：IQA-002、AC-001、AC-002、Verification Environment；依赖：T020、T021、T022）

### 实现

- [ ] T024 [US2] 实现 Azure Speech PushAudioInputStream adapter，使用 `DefaultAzureCredential` 获取 Speech scope token 并在到期前刷新 Speech configuration，执行 16 kHz/16-bit/mono PCM、continuous recognition/LID、候选集合过滤与 cancellation 后 recognizer 重建且不重放音频，使 T018、T019 通过；真实 managed identity/RBAC 验证仍由 Independent QA 执行（`src/server/adapters/azure-speech.ts`；来源：FR-002、FR-005、TD-003、TD-004、Azure Speech adapter Contract；依赖：T018、T019、T021）
- [ ] T025 [US2] 实现同源 WebSocket client 的 v1 协商与 `session.start`，协议不提供源语言字段，严格应用递增 server sequence 与 revision，并满足 T022 的无源语言协议断言（`src/client/api/translation-socket.ts`；来源：US-002、FR-002、AC-001、浏览器 WebSocket Contract；依赖：T018、T022、T024）

## Phase 4：US1 - 在外语发言期间阅读中文字幕

### 测试

- [ ] T026 [P] [US1] 先编写 translation coordinator 的 FIFO、累计 partial 替换、唯一 final、segment error 隔离、首次输出前一次 429/5xx retry、drain 和内容释放单元测试，并以 Vitest 的 ordinal/revision/sequence 断言作为证据（`tests/unit/coordinator.test.ts`；来源：FR-003、FR-004、FR-005、TD-005、领域不变量；依赖：T017、T025）
- [ ] T027 [P] [US1] 先编写 Foundry adapter 请求与事件解析单元测试，断言固定简体中文 instruction、`stream: true`、`reasoning.effort: "none"`、文本增量累积，以及 tool/reasoning/空输出拒绝且不记录内容（`tests/unit/foundry-translation.test.ts`；来源：FR-003、AC-002、Azure AI Foundry translation adapter Contract；依赖：T017、T025）
- [ ] T028 [P] [US1] 先编写 WebSocket 本地 contract 测试，覆盖 origin/subprotocol、状态、sequence、metadata/binary 配对、640-byte 帧、`audio.end` drain、稳定 `protocol.error` 与不回显内容（`tests/contract/websocket-v1.test.ts`；来源：FR-001、浏览器 WebSocket Contract、Quickstart 3；依赖：T017、T025）
- [ ] T029 [P] [US1] 先编写可由 Independent QA 在精确 Candidate 上启用的真实 Foundry contract/integration 自动化，验证配置 deployment 接受关闭 reasoning、无 reasoning、流式中文输出且无 fallback；本地默认明确 skip 且不读取 Azure 配置，以测试发现和静态检查通过作为 Coding 完成证据，真实结果留给下游（`tests/contract/foundry-translation.remote.test.ts`；来源：Azure AI Foundry translation adapter Contract、IQA-001、Verification Environment；依赖：T017、T025）
- [ ] T030 [P] [US1] 先编写浏览器 functional/end-to-end 辅助场景，通过 Candidate Fastify app 的 test DI 注入虚拟音频和 synthetic adapters：在 `audio.end` 前按 ordinal 显示至少两个字幕、静音阶段不生成字幕而后续恢复、单片段失败后下一片段继续，并记录输入阶段、结束边界及 UI 事件顺序（`tests/functional/streaming-subtitles.spec.ts`、`tests/functional/silence-recovery.spec.ts`；来源：IQA-001、IQA-003、AC-003、AC-004、Quickstart 3；依赖：T017、T025）
- [ ] T031 [US1] 先创建 Independent QA 可对已部署 Candidate 启用的 IQA-001 与 IQA-003 端到端入口：经显式 remote base URL 和通过 T020 校验的外部 fixture bundle 驱动 Candidate WebSocket，分别采集发言结束前多次有序字幕及“可识别—无可识别—可识别”三阶段证据；记录 Candidate identity、target、fixture hash、输入/结束边界、server sequence/ordinal、locale、字幕与无输出阶段，缺少场景音频或边界定义必须在联网前失败，默认发现但 skip 且不读取 Azure endpoint/credential（`tests/functional/remote/iqa-001.spec.ts`、`tests/functional/remote/iqa-003.spec.ts`、`tests/functional/support/remote-candidate.ts`、`tests/functional/support/iqa-evidence.ts`、`tests/functional/support/audio-fixture-bundle.ts`；来源：IQA-001、IQA-003、AC-003、AC-004、Verification Environment；依赖：T020、T023、T029、T030）
- [ ] T032 [US1] 为 IQA-001 至 IQA-003 建立统一 remote suite 命令、fixture bundle 前置校验和证据 schema 校验，断言三个入口可发现、完整 bundle 才能显式访问已部署 Candidate、默认执行不发起网络请求，并使缺少音频/manifest/hash/场景引用/证据字段或使用 synthetic target 时失败（`package.json`、`tests/functional/remote/remote-suite.test.ts`、`tests/functional/support/audio-fixture-bundle.ts`、`tests/functional/support/iqa-evidence.ts`；来源：IQA-001 至 IQA-003、Verification Environment、Quickstart 5-6；依赖：T023、T031）
- [ ] T033 [US1] 先编写生产 composition root 定向 contract 测试，断言正常 `dist/server/index.js` 入口仅从已校验 server 配置实例化真实 Azure Speech 与 Foundry adapters、注入 Fastify app factory 且无 synthetic 切换路径；覆盖任一 adapter/app 启动失败时已创建资源清理，以及 SIGTERM/正常关闭时停止接入、drain、取消并关闭两个 adapter，并保留实现前失败与随后通过结果（`tests/contract/production-composition-root.test.ts`；来源：Technical Context、Architecture、数据流与生命周期、部署拓扑、版本兼容性与 adapter 义务；依赖：T018、T027、T032）

### 实现

- [ ] T034 [US1] 实现 Foundry Responses streaming adapter，使用 managed identity token、固定中文翻译指令和关闭 reasoning 参数，只消费文本增量/completed，执行批准的一次 retry 并将 provider 失败映射为无内容类别，使 T027 通过（`src/server/adapters/foundry-translation.ts`；来源：FR-003、TD-006、Azure AI Foundry translation adapter Contract；依赖：T026、T027、T029）
- [ ] T035 [US1] 实现每会话唯一 FIFO translation coordinator，串行处理 final STT segment、输出累计 partial/唯一 final、隔离 error、保持静音等待并在队列排空后结束，使 T026 通过（`src/server/session/coordinator.ts`；来源：FR-003、FR-004、FR-005、TD-005、数据流与生命周期；依赖：T026、T028、T034）
- [ ] T036 [US1] 实现 Fastify WebSocket upgrade 与每连接 handler，执行同源、subprotocol、schema、帧配对、sequence、状态和生命周期校验，连接使用 app factory 注入的 Speech/Translation adapters，并向生命周期注册新连接拒绝、drain 与超时取消，使 T028 与 T011 的 lifecycle contract 通过（`src/server/websocket/handler.ts`、`src/server/app.ts`、`src/server/lifecycle.ts`；来源：FR-001、FR-004、浏览器 WebSocket Contract、TD-002、graceful shutdown 决策；依赖：T027、T028、T034、T035）
- [ ] T037 [US1] 实现生产 composition root：正常服务入口从 T013 已校验配置实例化真实 `AzureSpeechAdapter` 与 `FoundryTranslationAdapter`，注入 Fastify app factory 并绑定现有生命周期；任一初始化/监听失败须关闭已创建资源，正常关闭或 SIGTERM 须停止接入、drain、取消并释放两个 adapters，生产入口不得引用 synthetic adapters，使 T033 通过并让 production build 的 `dist/server/index.js` 成为正常容器命令（`src/server/index.ts`、`src/server/app.ts`、`src/server/lifecycle.ts`；来源：Technical Context、Architecture、数据流与生命周期、TD-002、TD-007、部署拓扑；依赖：T024、T033、T034、T036）
- [ ] T038 [US1] 实现用户手势麦克风采集、AudioWorklet PCM 重采样/20 ms 分帧、开始/停止流程和按 ordinal/revision 以 React text node 渲染当前会话字幕，释放音频节点并使 T022、T030 通过（`src/client/audio/pcm-worklet.ts`、`src/client/components/SubtitleView.tsx`、`src/client/App.tsx`、`src/client/main.tsx`；来源：US-001、FR-001、FR-004、FR-005、AC-003、AC-004、Component 边界；依赖：T029、T030、T031、T034、T035、T036）

## Phase 5：Polish

- [ ] T039 [P] 创建多阶段 Node.js 22 Linux OCI 构建，以 `npm ci` 构建并裁剪 production dependencies，使用非 root 用户监听 3000，包含可由 Fastify 提供的 `dist/client` 与 `dist/server`，并把正常 `dist/server/index.js` production composition root 设为容器命令；排除源码测试证据、`.env` 与 `.ai-delivery`，以本地 image build、用户/CMD 检查、正常入口启动、`/healthz` 和 Web app 入口可访问结果作为 Coding 证据（`Dockerfile`、`.dockerignore`；来源：TD-007、部署拓扑、Production candidate 治理；依赖：T003、T015、T037、T038）
- [ ] T040 [P] 创建 active Feature 部署契约，声明 container port、health path、WebSocket、managed identity、非秘密配置引用与 secret 引用规则、termination grace/drain 配置、Candidate 关联字段、幂等 `developerSetupCommands`，以及仅含非空 `staticAnalysis`、`build`、`developerTests` 和实际可本地执行的 `functionalTests` 分类命令；容器启动契约指向 T037 的正常 production 入口，不得填入最终 SHA、digest、target 或凭据（`.ai-delivery/features/003-delivery-dlv-20261112-62ad2488e7c4/runtime/deployment.json`；来源：Technical Context 治理约束、部署拓扑、Quickstart；依赖：T004、T017、T037、T038）
- [ ] T041 验证 IQA-001 至 IQA-003 remote suite 的测试发现、外部 fixture bundle schema/example、完整性正反例、缺失输入联网前失败、默认 skip、无网络访问和证据 schema 失败边界，保存 Coding 命令与退出码；不得执行 Azure、远程部署或 Independent QA，也不得生成最终 Candidate/target 结果（`package.json`、`tests/functional/fixtures/manifest.schema.json`、`tests/functional/fixtures/manifest.example.json`、`tests/functional/support/audio-fixture-bundle.test.ts`、`tests/functional/remote/iqa-001.spec.ts`、`tests/functional/remote/iqa-002.spec.ts`、`tests/functional/remote/iqa-003.spec.ts`、`tests/functional/remote/remote-suite.test.ts`；来源：IQA-001 至 IQA-003、Verification Environment；依赖：T020、T032、T038）
- [ ] T042 执行 deployment contract 声明的 clean-runner setup 与 `staticAnalysis`、`build`、`developerTests`、`functionalTests`，随后构建 OCI image：先以无 secret 的合法非生产配置运行正常容器命令，证明真实 Azure adapter composition root 被实例化、Fastify Web app/health 可用且未切换 synthetic adapter，在不建立翻译会话的情况下停止以避免 Azure 访问；再使用只读挂载的 test-only harness 注入 synthetic adapters，让虚拟音频实际经过 image 内 Candidate Fastify/WebSocket 应用并重放 IQA 辅助行为；发送 SIGTERM，记录 503、拒绝新连接、在途 drain、两个 adapter 清理和 grace timeout 取消的事件顺序、stdout/stderr 与退出码，首次失败即停止，并扫描受控文件与 image 不含 secret/客户内容（`package.json`、`package-lock.json`、`Dockerfile`、`src/server/index.ts`、`tests/contract/production-composition-root.test.ts`、`tests/functional/support/image-candidate-server.mjs`、`tests/functional/image-lifecycle.spec.ts`、`.ai-delivery/features/003-delivery-dlv-20261112-62ad2488e7c4/runtime/deployment.json`；来源：Quickstart 1-4、Verification Environment、graceful shutdown 决策、Constitution；依赖：T039、T040、T041）

## 完成证据

- Setup 与 Foundational：锁定依赖可通过 `npm ci` 安装；静态分析和 build 在 clean workspace 且无 Azure 凭据时可重放；基础 Vitest/contract 测试明确证明协议、配置、状态、静态 Web 提供、server-side test DI、内容隔离和 SIGTERM 生命周期。
- US2：T018、T019 与 T022 提供 Speech 行为、token 获取/到期刷新及 synthetic Candidate 链路的辅助证据；T020 明确 Independent QA 外部音频 fixture bundle contract 及联网前完整性校验，T021 提供真实 Speech contract/integration 入口，T023 提供 IQA-002 远程 Candidate 入口与证据格式；真实 managed identity、RBAC、完整语言集合、外部音频执行和 Azure 结果由 Independent QA 产生。
- US1：T026 至 T030 提供协议、翻译顺序、流式 UI、静音恢复和错误隔离的本地辅助证据；T029 提供真实 Foundry contract/integration 入口，T031、T032 提供 IQA-001 至 IQA-003 可执行 remote suite、fixture 前置校验与完整证据 schema；T033、T037 证明正常生产入口实例化并管理两个真实 Azure adapters，且 synthetic 注入仍仅限测试。Coding 只验证入口和输入 contract，不访问 Azure，不得以 synthetic、health 或 build 结果替代真实验收。
- Production candidate readiness：根目录 `Dockerfile` 与 active Feature 的 `runtime/deployment.json` 可供平台在 clean runner 重放；本地 OCI 证据证明 image 的正常命令使用 production composition root 提供 Web app，并在不建立 Azure 会话的情况下验证启动/关闭；test-only server DI 另行执行 synthetic functional 场景及 SIGTERM/503/拒绝新连接/drain/超时取消。Coding 不填造最终 commit SHA、registry digest、远程 target、QA、UAT、审批、Review 或 Merge 结果。
