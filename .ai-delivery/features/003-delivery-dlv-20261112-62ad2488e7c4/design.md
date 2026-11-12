# 流式语音翻译技术方案

## 实施就绪状态

`implementationReady: true`

## 技术上下文（Technical Context）

- 交付形态是浏览器 Web app。浏览器采集麦克风音频，服务端承担 Azure 连接、语言自动识别、翻译编排和字幕事件分发；不建设桌面客户端、账户系统或会议平台集成。
- 当前仓库只有 AI Delivery 制品和项目说明，没有既有应用代码、构建系统或运行时约定。本方案选择单仓库、单 Node.js toolchain、单 OCI 容器，从空白实现。
- 运行时固定为 Node.js 22 LTS；前端采用 React 19、Vite 和 Web Audio API，服务端采用 Fastify 5、原生 WebSocket 协议处理及 Microsoft Cognitive Services Speech SDK。源代码统一使用 TypeScript strict mode。
- Azure Speech 使用 continuous recognition 与 continuous language identification；浏览器无需提供源语言。每个 STT 已确认片段进入一个有序翻译队列，Azure AI Foundry 模型以流式响应生成简体中文，reasoning 显式关闭。
- 生产部署选择支持 WebSocket 与 managed identity 的 Azure Container Apps，静态前端和 Fastify 服务由同一 Linux OCI image 提供。应用不使用数据库、消息队列、持久化存储或外部 telemetry backend。
- 音频、识别文本和译文仅存在于当前进程内存及必要的 Azure 请求链路中，会话结束即释放。服务日志不得包含这些内容。
- Azure 资源名称、endpoint、模型 deployment 名称、完整候选语言集合及环境凭据属于部署配置。Coding 不需要也不得访问这些云资源；真实 contract 和端到端结果由部署后的远程 integration 与 Independent QA 产生。

## 治理与技术约束

- Constitution 要求最简单架构并保持批准范围，因此采用浏览器、单体服务和两个既有 Azure 能力的最小拓扑，不增加身份产品、数据库、缓存、队列、会议平台或历史字幕能力。
- Constitution 要求服务端保管凭据、managed identity 优先和 least privilege。浏览器只连接同源应用；生产容器以 managed identity 获取 Azure token，Azure RBAC 分别限制在目标 Speech 资源和目标 Foundry project/deployment。
- 所有外部链路使用 HTTPS/WSS。服务端验证 WebSocket 消息类型、状态、序号、音频帧及模型输出；日志只允许 correlation id、事件类别、状态、耗时和无内容错误类别。
- 每项用户可见行为必须可独立验收。IQA-001 至 IQA-003 均在真实 Azure 测试服务上针对同一不可变 Candidate 执行；本地 synthetic adapter、单元测试、构建和 health check 只提供辅助证据。
- 已批准制品没有数值延迟、吞吐量、准确率、可用率、保留期或并发量目标。本方案不把技术默认值提升为产品门禁；服务限制由目标资源 contract 和部署配置约束。
- Production candidate 必须包含根目录 `Dockerfile` 及 active Feature 下的 `runtime/deployment.json`。后者声明幂等 `developerSetupCommands`，以及唯一分类对象 `developerValidationCommands`，其中 `staticAnalysis`、`build`、`developerTests` 为非空命令数组；只有实际提供相应真实环境命令时才声明 `integrationTests` 或 `functionalTests`。
- Azure Speech 的 continuous language identification 受目标区域、资源、SDK、音频格式和候选集合限制。部署配置中的候选集合必须等于在目标环境验证过的 Speech 自动检测集合与 Foundry 翻译能力集合的完整交集，不得由 UI 缩减、固定为单一语言或在验收时抽样。

## 架构概览（Architecture）

系统采用四个边界清晰的 component：

1. **Browser client**：在用户手势下申请麦克风权限；AudioWorklet 将浏览器音频重采样为协议格式；通过同源 WSS 发送有序音频帧；按 `segmentId` 和 `sequence` 渲染中文 partial/final 字幕。界面只提供开始、停止和当前会话字幕，不提供语言选择、历史记录、导出或登录。
2. **Session gateway**：Fastify 提供静态文件、`GET /healthz` 和 `GET /ws/v1/translate` upgrade；执行 origin、schema、帧大小、序号和会话状态校验；为每个连接建立隔离的内存会话。
3. **Speech adapter**：把协商后的 PCM 帧写入 Azure Speech SDK `PushAudioInputStream`，使用 continuous language identification 和 continuous recognition 输出带源语言的已确认 STT segment。短暂无语音时保持会话等待，不合成文本。
4. **Translation adapter**：按 STT segment 顺序调用目标 Azure AI Foundry deployment；固定目标为简体中文、禁止总结或回答、关闭 reasoning，并以流式模型输出形成 `subtitle.partial`，完成后形成 `subtitle.final`。

单连接内的 translation coordinator 串行处理 final STT segments，避免后到请求先返回导致字幕乱序。不同 WebSocket 会话相互隔离，可由单容器并发处理；横向扩容时每个连接在生命周期内由一个 replica 持有，不共享会话状态。

需求追踪如下：

- FR-001：Browser client、Session gateway、Speech adapter。
- FR-002：Speech adapter 的 continuous language identification，且协议没有源语言输入字段。
- FR-003：Translation adapter 固定中文翻译 contract。
- FR-004：连续 STT segment、有序翻译队列和 partial/final 字幕事件在 `audio.end` 前即可产生。
- FR-005：Speech recognizer 在静音期间保持运行；无 STT segment 就不调用翻译，后续 segment 继续进入同一队列。

## 技术决策与替代方案

| 决策 ID | 选择 | 理由 | 已考虑替代方案 | 来源 |
|---|---|---|---|---|
| TD-001 | Node.js 22 LTS、TypeScript、React 19、Vite、Fastify 5，前后端共用一个 workspace | 单一语言、toolchain 和 image，降低空白仓库及 clean runner 的实现复杂度 | Python 3.12 + FastAPI 会增加第二套 toolchain 及 callback/async bridge | 技术基线 Option A |
| TD-002 | 服务端代理音频并持有全部 Azure 连接 | 统一执行凭据隔离、输入验证、顺序和会话生命周期控制 | 浏览器直连 Speech 需要 token broker，并扩大客户端云连接面 | Constitution 安全条款；技术基线 Option C |
| TD-003 | 16 kHz、16-bit signed little-endian、mono PCM；每帧 20 ms/640 bytes | Speech push stream 可直接消费固定格式；固定帧可确定性校验，且不引入有损编码器 | 浏览器原始采样率会造成设备差异；压缩音频增加 codec 和服务兼容面 | FR-001；技术基线音频协商要求 |
| TD-004 | Speech SDK continuous recognition + continuous language identification；候选集合来自部署配置 | 无需用户预选语言，并可在连续输入中处理后续可识别内容 | 固定语言、并行识别器或 UI 语言选择会改变 FR-002 | FR-002、FR-005、AC-001 |
| TD-005 | 仅将 final STT segment 串行送入 Foundry；模型响应流形成字幕 partial/final | 不用不稳定 STT partial 触发重复翻译，同时可在发言结束前持续产生多段中文输出并严格保序 | 并行翻译可能乱序；整场结束后翻译违反 FR-004 | FR-003、FR-004、AC-003 |
| TD-006 | 使用 Azure AI Foundry OpenAI-compatible Responses API 的流式 contract，deployment 由环境配置；请求设置 `reasoning.effort: "none"` | 满足关闭 reasoning 和流式中文输出要求，避免将未验证的模型名写死在代码 | gpt-sol-6.1 可作为 deployment，但必须先验证可用性和关闭 reasoning contract；静默 fallback 不允许 | 技术基线技术要求及兼容性约束 |
| TD-007 | 单 Linux OCI image 部署 Azure Container Apps，managed identity 访问两个 Azure 服务 | 满足 Web app、WSS、凭据和最小拓扑要求 | App Service for Containers 可兼容但不是本 Candidate 的选定拓扑 | 技术基线部署建议 |
| TD-008 | 全部会话数据仅驻内存，会话结束释放 | 已批准范围不需要保存、导出或历史记录，同时降低客户内容暴露面 | 数据库或 blob storage 没有批准来源 | Specification 范围外边界；Constitution |
| TD-009 | Vitest 验证纯逻辑与 synthetic adapters，Playwright 驱动浏览器和本地 synthetic 端到端，真实 Azure 验证留给远程阶段 | 本地可确定性覆盖协议和行为，同时不冒充云验收 | 全部 Mock 不能证明真实集成；Coding 直连 Azure 违反 Constitution | 测试策略；技术基线验证环境 |
| TD-010 | npm lockfile、ESLint、TypeScript、Vite 和现有 npm scripts 构成 clean-runner toolchain | 所有依赖可锁定并由声明命令安装、检查和构建 | 未锁定安装或依赖预热 cache 不满足仓库治理 | 技术基线；仓库治理 |

## 领域与数据模型

所有模型均为会话内存对象，不落盘。

- `TranslationSession`
  - `sessionId: string`：服务端生成的 UUID，不接受客户端指定。
  - `correlationId: string`：仅用于无内容日志和测试证据关联。
  - `state: "connected" | "streaming" | "draining" | "ended"`.
  - `nextClientSequence: number`、`nextServerSequence: number`：分别校验入站和生成出站单调序号。
  - `audioFormat`：固定为 `pcm_s16le`、`16000` Hz、`1` channel、`20` ms。
  - `recognizer`、`audioStream`、`translationQueue`：仅在会话生命周期持有。
- `SpeechSegment`
  - `segmentId: string`：服务端按 STT final 结果生成 UUID。
  - `ordinal: number`：会话内从 1 递增，是字幕保序依据。
  - `sourceLanguage: string`：Speech 返回的 BCP-47 locale，必须属于配置候选集合。
  - `sourceText: string`：仅用于当前翻译请求，完成或失败后释放。
- `SubtitleSegment`
  - `segmentId`、`ordinal`、`sourceLanguage`：对应一个 `SpeechSegment`。
  - `revision: number`：同一 segment 每次 partial 从 1 递增，final 使用下一个值。
  - `status: "partial" | "final" | "error"`。
  - `text?: string`：partial/final 时为累计的中文译文；error 时不存在。
  - `errorCategory?: "speech" | "translation" | "protocol"`：非内容分类，不暴露 provider 原始消息。

不变量：

- 一个 `segmentId` 只对应一个 final STT segment；一个成功 segment 只有一个 `subtitle.final`。
- `ordinal` 决定跨 segment 显示顺序；当前 ordinal 成为 final 或 error 后，下一 ordinal 才可向客户端输出。
- 同一 segment 的 `revision` 和全部服务端 `sequence` 严格递增；客户端忽略不大于已应用 revision/sequence 的重复或过期事件。
- 模型 partial 是累计文本，客户端替换该 segment 当前文本而非追加，避免重放造成重复。
- 空白 STT final、候选集合外 locale 和空白模型结果都不能形成字幕，按 adapter error contract 隔离后继续会话。
- `audio.end` 只结束输入；已入队 segment 完成后才发送 `session.end`。断开连接立即取消 Azure 工作并清空内存，不恢复历史字幕。

## Component 边界与项目结构

Coding 获准创建或修改的根路径清单如下：

- `./package.json`
- `./package-lock.json`
- `./tsconfig.json`
- `./eslint.config.js`
- `./vite.config.ts`
- `./index.html`
- `./Dockerfile`
- `./.dockerignore`
- `./.gitignore`
- `src/client/`
- `src/server/`
- `src/shared/`
- `tests/unit/`
- `tests/contract/`
- `tests/functional/`
- `.ai-delivery/features/003-delivery-dlv-20261112-62ad2488e7c4/runtime/`

具体结构：

```text
src/
├── client/
│   ├── audio/pcm-worklet.ts
│   ├── api/translation-socket.ts
│   ├── components/SubtitleView.tsx
│   ├── App.tsx
│   └── main.tsx
├── server/
│   ├── adapters/azure-speech.ts
│   ├── adapters/foundry-translation.ts
│   ├── adapters/types.ts
│   ├── config.ts
│   ├── health.ts
│   ├── session/coordinator.ts
│   ├── session/state-machine.ts
│   ├── websocket/handler.ts
│   └── index.ts
└── shared/
    ├── protocol.ts
    └── schemas.ts
tests/
├── unit/
├── contract/
└── functional/
```

`src/shared/` 只共享 wire schema 和无环境依赖的类型，不包含 secret 或 server adapter。`tests/contract/` 同时包含本地协议 contract 和仅在远程环境启用的 Azure adapter contract；命令按环境拆分，默认开发者测试不得读取 Azure 配置。`.gitignore` 忽略 `node_modules/`、`dist/`、`coverage/`、Playwright 输出、`.env*`（保留无 secret 的 `.env.example` 时须显式例外）及本地编辑器输出；`.dockerignore` 排除相同本地产物、测试证据和 `.ai-delivery/`，但 Candidate 所需 `runtime/deployment.json` 由平台独立消费，不复制进 image。

## 数据流、状态、并发与生命周期

1. 浏览器加载同源静态资源；用户点击开始后获得麦克风流，建立 WSS 并发送 `session.start`。
2. 服务端验证 origin、协议版本和固定音频格式，初始化 Speech token、push stream 和 recognizer；成功后回 `session.started`，浏览器才发送音频。
3. 每个 `audio.chunk` metadata 后必须紧邻一个 640-byte binary frame。服务端校验序号和长度后写入当前 push stream。
4. Speech 的 interim recognition 仅用于 adapter 内部，不发送、不翻译。每个非空 final recognition 生成递增 `SpeechSegment` 并进入 FIFO。
5. coordinator 每次只处理队首。Foundry 流式增量在服务端累积并校验为中文翻译输出，再发送累计 `subtitle.partial`；响应完成后发送 `subtitle.final`，释放 source/target text，处理下一项。
6. 静音或暂时不可识别输入不会创建 segment、不会调用模型，也不会结束 session。后续识别结果继续使用下一 ordinal。
7. 浏览器发送 `audio.end` 后不再发送 frame；服务端关闭 push stream，等待 Speech final callback 和翻译队列排空，发送 `session.end` 后正常关闭连接。
8. 浏览器断线、超出协议状态或服务端 shutdown 时，取消 recognizer 和模型流、清空队列并释放音频节点；不跨连接恢复字幕。

状态转换：

- `connected --session.start--> streaming`
- `streaming --audio.chunk--> streaming`
- `streaming --audio.end--> draining`
- `draining --recognizer stopped && queue empty--> ended`
- 任意非 `ended` 状态在 socket close、不可恢复 protocol error 或进程 shutdown 后进入 `ended`

并发规则：

- WebSocket 保证单连接消息顺序；handler 以每连接串行状态机消费控制帧与其后 binary frame。
- Speech callback 只把 immutable segment 放入该会话 FIFO，不直接写 socket。
- coordinator 是每会话唯一字幕 writer；因此不需要跨线程锁，也不会发生 segment 乱序。
- replica 不共享状态。Container Apps 可横向增加 replica；既有 WebSocket 不迁移，scale-in 或 rollout 可使该会话断开，但不声明历史恢复能力。

Speech cancellation 后，adapter 关闭失效 recognizer，产生不含内容的 `segment.error`，并为后续音频创建新的 push stream/recognizer；不重放已经送入失效 recognizer 的音频。Foundry 请求只在尚未向客户端发送该 segment 的任何模型输出时，对明确的 429 或 5xx 重试一次并遵守 `Retry-After`；其余失败将该 ordinal 标记为 error 并继续下一 segment，避免重复或混合译文。

## Interface 与契约（Contract）

### 浏览器 WebSocket

- URL：`GET /ws/v1/translate`
- subprotocol：`stream-translation.v1`
- transport：生产仅 `wss://`；本地测试允许 loopback `ws://`。
- origin：必须与配置的应用 origin 精确匹配；不接受 query string 中的 token、语言或资源标识。
- JSON control/event 统一包含 `type`、`version: 1` 和 `sequence`。客户端与服务端各自维护从 1 开始、无跳号递增的 sequence。

客户端消息：

| type | 允许状态 | payload | 结果 |
|---|---|---|---|
| `session.start` | connected | `audio: { encoding: "pcm_s16le", sampleRateHz: 16000, channels: 1, frameDurationMs: 20 }` | 初始化会话；没有源语言字段 |
| `audio.chunk` | streaming | `byteLength: 640` | 下一 WebSocket frame 必须是恰好 640 bytes 的 binary frame |
| `audio.end` | streaming | 无 | 结束输入并进入 draining |

服务端事件：

| type | payload | 语义 |
|---|---|---|
| `session.started` | `sessionId`、协商后的 `audio` | 可以开始发送音频 |
| `subtitle.partial` | `sessionId`、`segmentId`、`ordinal`、`revision`、`sourceLanguage`、`text` | 当前 segment 的累计中文译文，可被更高 revision 替换 |
| `subtitle.final` | 同 partial | 当前 segment 的稳定最终中文译文 |
| `segment.error` | `sessionId`、`segmentId?`、`ordinal?`、`category`、`recoverable: true` | 当前输入/片段无内容错误；会话继续 |
| `session.end` | `sessionId`、`lastOrdinal` | 输入结束且已入队工作处理完毕 |

`protocol.error` 用于 schema、状态、origin、sequence、控制帧/binary 配对或大小错误，payload 只有稳定 `code`，随后以 WebSocket 1008 关闭。服务端不得回传原始输入、provider error、stack 或 secret。未知字段和未知消息类型拒绝，字符串在 schema 层限制为协议所需枚举或 UUID；字幕文本只来自服务端 adapter，React 以 text node 渲染，不使用 HTML 注入。

### Azure Speech adapter contract

- SDK：Microsoft Cognitive Services Speech SDK for JavaScript/Node，输入 `AudioStreamFormat.getWaveFormatPCM(16000, 16, 1)`。
- 模式：continuous recognition 与 continuous language identification；部署配置提供完整、去重的 BCP-47 candidate locale 数组。
- 身份：`DefaultAzureCredential` 获取 `https://cognitiveservices.azure.com/.default` token；token 在到期前刷新并更新 Speech configuration，长期 key 不进入生产配置。
- 输出：只接受 recognized final、非空文本、已识别 locale 属于候选集合的结果。`NoMatch` 不创建翻译；canceled 进入恢复路径。
- 真实 contract test 必须证明目标 endpoint/region 支持配置的完整集合、连续输入、自动识别 locale 和固定 PCM 格式。

### Azure AI Foundry translation adapter contract

- API：目标 project/deployment 暴露的 OpenAI-compatible Responses streaming API；endpoint、deployment 和 API contract version 由部署配置提供，代码不得 fallback 到其他 deployment。
- 身份：`DefaultAzureCredential` 使用目标 Foundry 服务要求的 Entra scope；生产不接受浏览器凭据。
- 请求包含固定 server-side instruction：仅把给定识别文本翻译为简体中文，不解释、总结、回答或添加标签；输入包含 `sourceLanguage` 和 `sourceText`；设置 `stream: true` 及 `reasoning: { effort: "none" }`。
- adapter 只消费文本增量和 completed event；拒绝 tool call、非文本输出、空 completed 输出及 provider 声明的 reasoning 内容。模型输出不写日志。
- 远程 contract test 必须针对配置 deployment 断言请求接受关闭 reasoning 参数、响应无 reasoning、可流式输出中文文本；若 gpt-sol-6.1 在目标 tenant/region 满足该 contract，可将其配置为 deployment，否则部署前必须由技术负责人选择另一个满足相同已批准 contract 的 Foundry deployment，代码和产品行为不变。

### 版本、兼容性与 adapter 义务

- WebSocket v1 只做精确版本协商；不兼容客户端以 1002 关闭。破坏性 schema 变化使用新 URL/subprotocol，不在 v1 静默改变语义。
- provider SDK/API 版本由 `package-lock.json` 和 deployment config 固定。依赖升级必须重新执行 Speech、Foundry contract 与全部功能场景。
- synthetic adapters 与 Azure adapters 实现相同 TypeScript interface：`SpeechAdapter.start/write/end/close` 和 `TranslationAdapter.translate/cancel`。synthetic 实现只由测试 dependency injection 启用，生产构建不得由客户端参数切换 adapter。

## 安全、隐私、身份与 Secret

- Container Apps managed identity 仅获目标 Speech 资源的数据面使用权限，以及目标 Foundry project/deployment 的模型调用权限；不授予资源创建、部署管理或订阅级角色。角色名称和 scope 由目标环境 IaC/平台配置按 Azure 实际 contract 固化并留存授权证据。
- 本地 Coding 默认使用 synthetic adapter，不需要 Azure secret。远程测试和生产由环境注入 endpoint、非秘密 deployment 配置及 managed identity；任何兼容性 key 仅可进入平台 secret store 和 server 环境，不能写入仓库、image、浏览器 bundle、命令参数或证据。
- Fastify 限制同源 WebSocket upgrade；Container Apps 终止公网 TLS，并通过 HTTPS/WSS 转发。应用不新增用户认证，因为账户和权限行为不在批准范围；部署 target 的公开访问边界沿用平台批准配置，不在本 Feature 新建身份产品。
- 音频 frame、STT text、译文和模型请求/响应不得记录、持久化或进入 telemetry。错误对象在日志前映射为稳定类别；测试 fixture 使用非敏感、专为测试生成或获准的语音，不使用真实会议内容。
- 服务端对 control schema、帧长度、状态转换、candidate locale、provider event type 和输出类型做 allowlist 验证；React 默认转义字幕。依赖使用 lockfile，container 以非 root 用户运行，runtime image 只包含 production dependencies 和构建产物。
- 会话关闭、超时断开或 shutdown 时立即取消 provider 调用并清除引用；没有备份、保留、导出和恢复客户内容的路径。

## 配置、可观测性与运维

启动时一次性校验以下 server 环境配置，缺失或非法则进程退出：

- `PORT`：容器 HTTP 监听端口，deployment 固定为 `3000`。
- `APP_ORIGIN`：允许的唯一浏览器 origin。
- `AZURE_SPEECH_ENDPOINT`、`AZURE_SPEECH_CANDIDATE_LOCALES`：目标 Speech endpoint 和完整 BCP-47 集合。
- `AZURE_FOUNDRY_ENDPOINT`、`AZURE_FOUNDRY_DEPLOYMENT`、`AZURE_FOUNDRY_API_VERSION`：已验证的模型 contract。
- `AZURE_CLIENT_ID`：仅 user-assigned managed identity 场景配置；system-assigned 时不设置。

前端不读取 Azure 配置。Vite 构建只注入协议版本和同源 WebSocket path，不能注入 secret 或 provider endpoint。

日志采用一行 JSON 写 stdout/stderr，仅含 `timestamp`、`level`、`event`、`correlationId`、`sessionState`、`durationMs`、`errorCategory`；禁止 source/target text、音频、locale 列表、endpoint query、token、provider response 和 stack 的非受控序列化。事件包括进程启动/停止、会话状态、adapter 状态、片段成功/分类失败和协议拒绝。

`GET /healthz` 仅在进程已启动、配置已通过校验且 event loop 可响应时返回 200；shutdown 开始后返回 503。它不访问 Azure、不报告模型能力，也不作为翻译验收证据。平台使用 Container Apps 原生日志和 replica/revision 状态；不新增 telemetry backend 或告警系统。支持人员只依据无内容 correlation id 关联平台日志和 QA 证据。

## SLO、限制、扩缩容、重试与恢复

- 产品没有获批准的数值 SLO，不新增延迟、可用率、吞吐量、准确率或并发门槛。发布判断使用 AC-001 至 AC-004 和 IQA-001 至 IQA-003，而不是 health 或内部耗时。
- 协议限制来自固定音频 contract：每个 chunk 恰好 640 bytes，严格 sequence，单连接只有一个活动 session。候选语言数量、locale 支持、请求大小和模型限制以目标 Azure contract test 的完整结果为准，不能由未经验证的常量扩大。
- 初始 Container Apps replica 和 min/max replica 由平台环境容量配置决定，不构成产品承诺。扩容按活动连接/平台支持的指标配置前，必须在目标环境验证 WebSocket 行为；应用本身不依赖 sticky session 之外的跨请求状态，因为每条连接天然固定到一个 replica。
- translation retry 仅限首次输出前的 429/5xx 一次，并遵守合法 `Retry-After`；不重试 validation、authentication、authorization 或已开始输出的请求。Speech SDK transport 恢复行为由锁定 SDK contract 验证；取消后应用重建 recognizer 以接收后续内容，不重放已消费音频。
- 单 segment 失败发送 `segment.error` 并继续，不关闭整个会话。不可恢复 protocol error 才关闭连接。进程或网络断线不会恢复未批准的历史字幕，用户可重新开始新会话。
- SIGTERM 后 health 变为 503、停止接受新连接，并让平台 termination grace period 内的连接 drain；期限到达后取消 provider 工作并关闭。不存在需要恢复的持久状态。

## 部署拓扑、迁移、Rollout 与 Rollback

拓扑为：Browser → Container Apps HTTPS/WSS ingress → 单一应用 container → Azure Speech endpoint 与 Azure AI Foundry endpoint。仅允许两个批准 Azure 服务所需的出站访问；不引入数据库、队列或第三方服务。

`Dockerfile` 使用 Node.js 22 的锁定 Linux image，多阶段执行 `npm ci`、静态前端/服务端 build 和 production dependency 裁剪；runtime stage 以非 root 用户监听 3000，并包含静态 `dist/client` 与 `dist/server`。image 不包含源测试证据、`.env` 或 `.ai-delivery`。

active Feature 的 `runtime/deployment.json` 记录 container port、`/healthz`、WebSocket 支持、managed identity、非秘密配置引用、secret 引用规则、setup/validation commands 及 Candidate 关联字段。image tag 使用 Candidate commit SHA，平台记录不可变 digest；远程 target、QA 证据、SHA 和 digest 必须一致。

当前没有应用数据，首次部署和升级均无需数据迁移。provider SDK、WebSocket v1 或 deployment 配置升级先通过 CI，再部署新 Container Apps revision 做真实 contract 与功能验证。rollout 将流量切至已验证 revision；旧 revision 停止接收新连接并 drain 既有 WebSocket。rollback 将流量切回上一不可变 image/revision；进行中的新 revision 会话可能断开，不迁移其内存状态。

## 验证环境责任矩阵（Verification Environment）

| 验证类型 | 责任阶段 | 环境来源 | 依赖/凭据 | Coding 证据 | 下游结果 |
|---|---|---|---|---|---|
| TypeScript、ESLint、schema 与状态机静态检查 | Coding | 本地 clean workspace | Node.js 22、`npm ci`；无 Azure 凭据 | `staticAnalysis` 命令、退出码和报告 | CI 在 clean runner 重放后的结果 |
| 前后端 build 与 OCI image build | 平台 CI | clean runner/container builder | 锁定 npm 依赖与 Docker；无 Azure 凭据 | 可重放 build 命令、Dockerfile、lockfile | 同一 Candidate image digest |
| 协议、顺序、中文输出约束、错误隔离、静音后恢复单元/contract 测试 | Coding | Vitest + synthetic adapters | 合成事件与非敏感 fixture；无 Azure 凭据 | developerTests 结果，覆盖 FR-001 至 FR-005 的辅助断言 | CI 重放结果；不作为真实集成通过 |
| 浏览器采音、WSS 和字幕渲染 functional 辅助测试 | Coding / 平台 CI | Playwright、虚拟音频输入、本地 synthetic server | Chromium 与测试 fixture；无 Azure 凭据 | 可执行场景、输入阶段、事件与 UI 结果 | clean runner 的本地功能辅助结果 |
| Speech adapter contract | 远程 integration | 已批准 Azure Speech 测试资源 | Candidate managed identity/RBAC、目标 endpoint、完整候选 locale 集合、可核对流式音频 | adapter contract、配置 schema、correlation 证据格式 | 固定 PCM、continuous LID、完整集合逐语言识别及连续会话结果 |
| Foundry adapter contract | 远程 integration | 已批准 Foundry project/model deployment | Candidate managed identity/RBAC、endpoint、deployment | 请求 schema、关闭 reasoning 断言、无内容日志证据 | deployment 可用、reasoning 关闭、中文 streaming contract 结果 |
| IQA-001 外语发言期间持续字幕 | Independent QA | 已部署的精确 Candidate 与真实 Azure 测试服务 | Browser/可核对流式音频、两项 Azure 能力 | Candidate 中的可执行测试入口及 correlation/sequence 证据 | 发言结束前字幕、多次有序输出与输入边界证据 |
| IQA-002 未预设语言自动识别翻译 | Independent QA | 同一 Candidate/target | 完整合格语言交集及逐语言测试音频 | 无源语言 UI/协议字段、locale 与字幕证据格式 | 带日期完整交集清单、逐语言自动识别和中文字幕结果 |
| IQA-003 暂时无可识别内容后继续 | Independent QA | 同一 Candidate/target | 可识别语音—无可识别内容—可识别语音 fixture | 三阶段 sequence/segment 证据格式 | 中段无虚构翻译、后段无需选语言恢复的结果 |
| rollout、health、drain 与 rollback | release verification | Container Apps Candidate revision | image digest、部署权限、上一 revision | `/healthz`、SIGTERM/drain 行为及 deployment contract | target、revision、digest、流量切换和回滚记录 |

## 快速验证指南（Quickstart）

1. 在 clean runner 安装 Node.js 22 和 Docker，执行 `runtime/deployment.json` 中的 `developerSetupCommands`；不得依赖 cache 或临时安装未声明 package。
2. 按 `staticAnalysis`、`build`、`developerTests` 顺序执行声明命令，确认首次失败立即停止。验证默认启用 synthetic adapters 且没有 Azure 配置也能完成。
3. 启动本地 production build，确认 `/healthz` 返回 200；使用 Playwright 虚拟音频依次执行：
   - 未提供语言字段，synthetic Speech 返回可识别外语 segment，观察简体中文字幕；
   - 在 `audio.end` 前产生至少两个 final STT segments，观察对应字幕按 ordinal 出现；
   - 中间发送静音帧且 synthetic Speech 不产生 segment，确认无字幕，随后恢复 segment 并继续；
   - 注入一个 translation failure，确认该 ordinal 为 error 且下一 segment 继续；
   - 发送错误 sequence、格式或 frame 长度，确认稳定 protocol error 且不回显内容。
4. 构建 OCI image，以非 root 用户启动并重复 health 和本地 functional 辅助场景；记录 Candidate SHA 和 image digest。
5. 平台将该 digest 部署到批准的 Container Apps integration target，以 managed identity 分别运行 Speech 和 Foundry contract。先确认完整候选语言交集、固定音频格式、关闭 reasoning 和 streaming contract，再执行 IQA-001 至 IQA-003。
6. QA 保存输入阶段、发言结束边界、服务端 sequence/ordinal、语言识别结果、每次中文字幕、完整语言交集、Candidate SHA、image digest 和 target。只有全部 AC 的真实服务结果齐备才可通过；本地 synthetic、build 和 health 结果不得替代。

## 支持 Runbook

- **无法建立会话**：按 correlation id 检查 origin/protocol/config 分类、Container Apps revision 和 managed identity token 获取状态；不得要求提供会议音频或字幕内容。配置错误修正后部署新 revision。
- **Speech 无识别结果**：确认 Candidate digest、Speech endpoint、完整 candidate locale 配置、RBAC、PCM contract 和真实 contract 结果。`NoMatch` 与静音不视为应用错误；不得通过固定语言绕过 LID。
- **翻译片段失败**：检查稳定错误类别、Foundry deployment、RBAC、API version、429/5xx 和 reasoning-off contract。禁止日志记录或人工复制 source/target text；禁止静默切换模型。
- **字幕乱序或重复**：使用 session correlation id、server sequence、ordinal 和 revision 对照事件，不查看内容；若不变量失效，停止该 Candidate rollout并回滚上一 revision。
- **静音后不能继续**：检查 recognizer 是否仍处于 continuous 状态、cancellation 后是否重建及后续 audio sequence；用批准测试 fixture 在 integration target 复现。
- **资源或区域 contract 改变**：冻结 rollout，重新执行完整 Speech locale 交集与 Foundry contract；更新 deployment 配置和锁定依赖后生成新 Candidate，不在运行中 fallback。
- **发布异常**：停止向新 revision 分流，让可完成的连接 drain，然后把流量切回上一不可变 revision/image。会话内存不可迁移，不能宣称恢复已断开字幕。
- **疑似内容或 secret 泄漏**：停止受影响 revision，保留不含内容的访问与配置审计证据，轮换受影响凭据/identity assignment，并在恢复前确认日志和 image 不含敏感值。

## 开放决策

无。
