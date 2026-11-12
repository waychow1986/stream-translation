# 流式翻译技术方案

## 实施就绪状态

`implementationReady: false`

## 技术上下文（Technical Context）

本迭代从仅含 Delivery 制品的空应用仓库开始，拟交付一个浏览器 Web app：浏览器采集会议麦克风音频，单一 Node.js 服务负责 Azure Speech 实时听录、连续语言识别、Azure AI Foundry 中文翻译和字幕回传。目标语言固定为简体中文，用户不选择源语言。

技术栈固定为 Node.js 22 LTS、TypeScript 5、React 19、Vite、Fastify 5、`@fastify/websocket`、TypeBox、Microsoft Cognitive Services Speech SDK、Vitest 和 Playwright；传输使用标准 WebSocket protocol，不引入 Socket.IO 等附加协议。前后端使用同一 npm workspace 和同一进程产物；生产容器为 Linux OCI image，监听 `0.0.0.0:8080`，由 Azure Container Apps 提供 HTTPS/WSS ingress 与 managed identity。

语音路径不落盘。浏览器将麦克风输入转换为 16 kHz、16-bit little-endian、单声道 PCM，服务端通过 `PushAudioInputStream` 写入 Azure Speech。Speech SDK 使用 `LanguageIdMode=Continuous` 和服务端候选 locale 集合。每个已确认 STT segment 按识别顺序发送给 Foundry Responses-compatible streaming API，目标部署必须接受 `reasoning: {"effort":"none"}`；模型只返回对应的简体中文译文。

当前批准制品没有给出目标 Azure Speech resource 的 region/资源标识、目标 Microsoft Cognitive Services Speech SDK 精确版本、目标 Foundry project/deployment/API version，也没有这些目标的带日期权威能力导出或真实 contract 结果。gpt-sol-6.1 仍只是客户允许的候选；不能据此虚构其存在、语言能力或关闭 reasoning 的支持状态。因此完整合格源语言集合尚不能计算，本方案不能证明 FR-005/AC-002 在已批准 technical baseline 下可实现，Coding 不得开始。

本方案不引入数据库、消息队列、用户登录、会议平台集成、长期字幕历史或额外遥测产品。Azure 资源名称、deployment 名称、endpoint 和 managed identity principal 是部署配置，不是未决产品或架构选择。

## 治理与技术约束

- 已批准范围只包含会议语音到流式中文字幕。Web app 不接入 Azure、Teams 或其他会议平台；麦克风是唯一会议音频入口。（INT-001 至 INT-004、FR-001 至 FR-006）
- 字幕必须在持续输入结束前出现并继续更新，但没有固定延迟门禁。设计以连续 STT segment、Foundry streaming response 和逐片段字幕事件实现先后关系，不创建延迟承诺。（FR-004、AC-004、PQ-001）
- 合格源语言是 Azure Speech 连续自动检测能力与 Foundry 中文翻译能力的非中文交集。部署配置必须包含完整交集，服务启动时校验候选集合；Independent QA 使用同一时点清单逐语言验证，不能抽样。（FR-002、FR-005、AC-002）
- 凭据只在服务端。Azure Container Apps 使用 managed identity 与最小 RBAC；本地开发凭据只来自环境变量或开发 secret store。浏览器、image、仓库、日志和测试 fixture 均不得包含长期 Azure key。（Constitution 安全与隐私）
- 不记录音频、识别文本、译文、模型 prompt 或 response。日志只含 correlation id、不透明 session/segment id、状态、持续时间、计数和错误类别。（Constitution 安全与隐私）
- 外部 Azure 行为只能由部署后的精确 Candidate 在真实测试服务中证明。Coding 的 synthetic adapter、单元测试、构建和 health check 仅提供辅助证据。（Constitution 测试与质量）
- Production candidate 必须包含 `Dockerfile` 与本 Feature 的 `runtime/deployment.json`；后者按平台 schema 声明幂等 setup，以及 `staticAnalysis`、`build`、`developerTests` 三类非空 validation commands。CI 从 clean runner 构建同一不可变 image。
- 没有获批准的可用率、固定延迟、并发量、保留期、准确率或扩缩容数字。技术限制由浏览器、Azure API、容器平台和部署配置给出，不将内部保护值升级为产品门禁。

### 完整语言交集与单会话可行性闭合

权威 contract 与集合定义固定如下，Coding 无权改写：

- Azure Speech 官方 Language identification 文档（`https://learn.microsoft.com/azure/ai-services/speech-service/language-identification`）规定 continuous language identification 的候选语言必须在创建 recognizer 前提供，单次 continuous LID 最多配置 10 个候选语言；运行中不能把未配置语言自动扩入同一 recognizer。官方 Speech language support 表（`https://learn.microsoft.com/azure/ai-services/speech-service/language-support?tabs=stt`）只能作为生成候选的产品级来源，最终可用项还必须受目标 resource region 与所选 SDK 实际 contract 约束。
- `S` 定义为确定时点、目标 Speech resource/region、目标 Speech SDK 精确版本下，同时支持 real-time STT 与 continuous LID 的全部非中文 locale。`F` 定义为同一时点、目标 Foundry deployment/API version 的权威 model/deployment contract 明确支持从源语言翻译为简体中文、streaming response 且接受 `reasoning.effort=none` 的全部非中文 locale。合格源语言完整集合严格为 `E = S ∩ F`。
- 可行性充要条件为：存在目标 contract 证据，能够完整枚举 `S`、`F`、`E`，且 `1 <= |E| <= 10`；应用配置必须一次性把 `E` 的每个 locale 原样放入同一个 continuous LID recognizer，不能遗漏或增加。Foundry 的一般自然语言能力描述、模型家族说明或示例语言不能替代目标 deployment 的完整 `F` 清单。
- 若 `|E| > 10`，单一 continuous LID recognizer 无法覆盖 FR-005/AC-002。用户预选、按地区预选、抽样、轮换候选列表、多遍回放或并行 recognizer 猜测均被已批准规格/technical baseline 排除；本设计不采用这些规避方案。
- 当前没有目标资源/deployment 及其权威能力清单，故 `S`、`F`、`E` 和 `|E|` 均未知，不能满足上述充要条件。此处不是留给 Coding 的实现选择，而是已批准产品行为与已批准技术基线之间尚未证明兼容的上游阻塞。只有平台/资源负责人提供目标 contract 证据且 `|E| <= 10`，或业务与技术负责人按严格上游例外重新批准产品范围或 technical baseline 后，才能把 `implementationReady` 改为 `true`。若证据得到 `|E| > 10`，必须返回上游，不能修改本方案伪装成可实现。

## 架构概览（Architecture）

1. **Browser client**：经用户浏览器授权读取麦克风；`AudioWorklet` 重采样并编码 PCM；使用同源 WSS 发送 session control 与音频帧；按服务端字幕序号更新当前中文字幕；只在内存保留当前页面会话。
2. **Fastify application**：提供静态前端、health endpoint 和 `/api/v1/stream` WebSocket upgrade；执行 origin、消息 schema、状态、帧格式及大小验证；创建、关闭并隔离会话。
3. **Speech adapter**：仅在上述可行性充要条件已由批准证据满足后，把 PCM 写入 Azure Speech `PushAudioInputStream`，创建唯一 continuous recognition + continuous language identification recognizer，并把冻结的完整 `E`（最多 10 个 locale）一次性配置为候选；只输出带检测 locale 的 confirmed segment，取消或失败事件映射为非内容错误。
4. **Translation adapter**：按 segment 顺序调用 Foundry deployment，固定简体中文翻译 system instruction，关闭 reasoning，消费 streaming delta；拒绝空结果、非字符串结构和超出配置保护边界的输出。
5. **Session coordinator**：拥有单一 WebSocket 会话的状态、输入序号、segment 序号和字幕序号；串行处理 confirmed segment，保证字幕与语音顺序一致；单片段失败后继续接收和处理后续片段。
6. **Azure runtime**：单一 OCI container 部署到 Azure Container Apps；managed identity 分别获得 Speech 使用权限和 Foundry deployment 推理权限；实例内无持久状态，每条 WebSocket 连接固定在其建立时命中的实例直到连接结束。

## 技术决策与替代方案

| 决策 ID | 选择 | 理由 | 已考虑替代方案 | 来源 |
|---|---|---|---|---|
| TD-001 | Node.js 22 + TypeScript 全栈、React 19/Vite、Fastify 5 | 单语言、单 package graph、单容器最小化 clean-runner 与流式生命周期复杂度 | Python/FastAPI 增加双 toolchain 与 callback/async bridge；浏览器直连 Speech 增加 token broker 和客户端 Azure 故障面 | 技术基线 Option A |
| TD-002 | 浏览器 PCM 经 WSS 传到服务端，由 Speech SDK `PushAudioInputStream` 处理 | 凭据和 Azure contract 留在服务端，统一输入与会话控制 | 浏览器 Speech SDK 直连；录完整音频后批处理，后者违反 FR-004 | FR-001、FR-004；技术基线 |
| TD-003 | 16 kHz、16-bit little-endian、mono PCM；浏览器 `AudioWorklet` 重采样 | Speech SDK 支持的明确无压缩流格式，避免容器内转码工具 | MediaRecorder 压缩格式需要 codec/container 解码；浏览器原始采样率不能直接作为固定 contract | FR-001；技术基线音频协商要求 |
| TD-004 | 单个 Azure Speech continuous recognizer 一次性配置完整 `E`；仅当权威目标 contract 证明 `1 <= |E| <= 10` 才允许实施 | continuous LID 官方单会话候选上限为 10；这是同时满足“不预选”“不抽样”“单一连续会话”的唯一基线内路径 | 固定语言、用户/地区预选、候选轮换、抽样、多遍或并行 recognizer 均改变 FR-002/FR-005 或违反 technical baseline；若 `|E| > 10` 必须上游处理 | FR-002、FR-005、AC-002；技术基线 |
| TD-005 | 仅 confirmed STT segment 进入按序串行 Foundry 翻译队列，响应采用 streaming | 避免临时识别反复翻译；按语音顺序持续产生中文字幕 | 并发翻译需丢弃/重排过期响应；整会批量翻译违反流式边界 | FR-003、FR-004；技术基线 |
| TD-006 | Foundry Responses-compatible API，`reasoning.effort=none`，部署名配置化；目标 deployment 必须先提供完整 `F` 清单与真实 contract，gpt-sol-6.1 不硬编码 | 满足客户关闭 reasoning 的约束，并防止 Coding 猜测模型或语言范围 | 硬编码未经验证模型；由 Coding 选模型；静默启用 reasoning；非 Foundry 服务，均不符合基线 | 技术基线 |
| TD-007 | 每连接内存状态、无持久化；重连创建新 session | 没有历史恢复要求，减少客户内容存储与跨实例协调 | 数据库/队列没有获批准需求；重放历史会新增行为 | FR-006；Constitution |
| TD-008 | 单片段错误事件后继续会话；会话级协议、连接或 Azure Speech 终止错误结束当前连接 | 精确实现“失败输入不算成功且后续合格输入可恢复” | 任一片段失败终止整个会话违反 FR-006；自动恢复断线历史未获批准 | FR-006、AC-005 |
| TD-009 | Azure Container Apps 单容器、外部 HTTPS/WSS ingress、managed identity | 与已批准基线一致且支持 WebSocket；无共享状态可水平复制 | App Service for Containers 是环境已有标准时的备选，但当前仓库无该标准 | 技术基线 |
| TD-010 | Vitest 验证纯逻辑与 synthetic adapters，Playwright 验证本地可观察流式行为；真实 Azure contract/integration/E2E 由远程 integration 与 Independent QA 执行 | 分离无凭据开发者反馈和真实外部验收，且不让 Mock 冒充验收 | 只做 unit/smoke 不足；Coding sandbox 访问 Azure 违反 Constitution | Constitution；测试策略 |

## 领域与数据模型

所有模型均为进程内临时数据，不持久化。

- **EligibleLanguage**：`locale`（Azure locale，唯一）、`isNonChinese=true`、`speechContinuousLidSupported=true`、`foundryChineseTranslationSupported=true`、`speechResourceRegion`、`speechSdkVersion`、`foundryDeployment`、`foundryApiVersion`、`verifiedAt`、`sourceReferences`。运行时只加载经批准并冻结的完整 `E`；清单必须逐项可追溯到 `S` 与 `F`，验收清单另作为 Candidate 证据保存，不写入产品数据库。
- **TranslationSession**：`sessionId`、`correlationId`、`state`、`expectedAudioSequence`、`nextSegmentSequence`、`nextSubtitleSequence`、`startedAt`、`inputEnded`。状态由当前 WebSocket 连接独占。
- **AudioChunk**：`audioSequence`、`sampleOffset`、PCM bytes。其序号严格连续；数据写入 Speech stream 后即释放。
- **SpeechSegment**：`segmentId`、`segmentSequence`、`detectedLocale`、`recognizedText`、`recognitionStatus`。只有 `confirmed` 且 locale 属于完整候选集合的 segment 可进入翻译。
- **SubtitleSegment**：`segmentId`、`subtitleSequence`、`detectedLocale`、`status=partial|final`、`textZh`。partial 可被同一 `segmentId` 的更大字幕序号替换，final 结束该 segment；已 final 的 segment 不再变更。
- **SegmentFailure**：`segmentId`（能关联时）、`stage=language_detection|recognition|translation`、`category`、`recoverable=true`。不含源内容或供应商原始错误文本。

不变量：

- `audioSequence`、`segmentSequence` 和 `subtitleSequence` 在各自 session 内单调递增；事件序号不跨 session 比较。
- 翻译队列按 `segmentSequence` 串行消费；segment 失败会释放队首并继续下一项。
- 成功字幕的 `detectedLocale` 必须属于配置的合格集合，`textZh` 必须是非空字符串，且目标语义固定为简体中文。
- 合格集合必须与批准证据中的 `E` 完全相等且数量为 1 至 10；缺清单、超限、子集、额外 locale、资源/SDK/deployment/API version 不匹配均使配置无效并禁止启动。
- `audio.end` 后不再接受音频；已进入队列的 segment 完成或失败后发送 `session.end`。
- WebSocket 关闭、服务 shutdown 或 session 级失败时，Speech recognizer、push stream、翻译 request 和内存 buffer 必须全部释放。

## Component 边界与项目结构

已批准的创建或修改根路径如下：

- `./package.json`
- `./package-lock.json`
- `./tsconfig.json`
- `./eslint.config.js`
- `./vite.config.ts`
- `./vitest.config.ts`
- `./playwright.config.ts`
- `./Dockerfile`
- `./.dockerignore`
- `./.gitignore`
- `src/client/`
- `src/server/`
- `src/shared/`
- `tests/unit/`
- `tests/contract/`
- `tests/functional/`
- `tests/fixtures/`
- `.ai-delivery/features/001-delivery-dlv-20261112-7c9c585c00ff/runtime/`

`src/shared/` 定义 WebSocket schema、类型和版本；`src/client/` 仅负责音频采集、连接和字幕 UI；`src/server/session/` 负责状态机；`src/server/adapters/` 隔离 Speech、Foundry 与 synthetic 实现；`src/server/config/` 负责一次性配置校验；`src/server/app/` 负责 HTTP/WSS composition。测试 fixture 只包含人工合成、无客户内容的音频与期望含义。

TypeScript build、Vite、Vitest、Playwright、npm 和编辑器本地输出必须由 `.gitignore` 排除；container context 通过 `.dockerignore` 排除 `node_modules/`、测试结果、coverage、Git metadata、Delivery 报告和本地环境文件。任何 `.env*`、证书、key、录音和字幕采样文件默认排除；仓库只允许无 secret 的示例配置字段说明，不提交真实值。

## 数据流、状态、并发与生命周期

1. 页面加载后，用户开始麦克风；client 建立 WSS 并发送 `session.start`。服务端校验协议版本、同源 Origin、音频格式和当前无活动 session，随后创建 Speech recognizer 并返回 `session.started`。
2. `AudioWorklet` 连续产生 PCM。client 为每帧写入递增序号和 sample offset；server 只接受期望的下一帧并同步写入 `PushAudioInputStream`。乱序、重复、格式错误或超保护边界的帧触发协议级关闭，绝不尝试拼接不确定音频。
3. Speech interim 文本不发送到 Foundry，也不进入日志。每个 confirmed segment 取得 detected locale；中文、未识别、检测失败或不在候选集合的结果形成可恢复 `segment.error`，不计成功。
4. confirmed 合格 segment 进入每 session 的有界串行翻译队列。队列容量由 `MAX_PENDING_SEGMENTS` 部署配置保护；达到边界的当前 segment 产生 `translation.capacity` 错误并继续接收后续语音，不把丢弃项计为成功。该值是资源保护参数，不是产品规模承诺。
5. Foundry streaming delta 累积为当前 segment 的中文字符串，每次有效增长发送 `subtitle.partial`；响应完成且非空后发送 `subtitle.final`。若请求失败、输出无效或会话已结束，发送非内容 `segment.error`；队列继续下一 segment。
6. `audio.end` 关闭 push stream并停止继续接收音频；recognizer 完成最后结果后，coordinator 排空翻译队列，发送 `session.end` 并正常关闭连接。连接异常则取消所有未完成工作，不恢复历史。

状态转换为 `IDLE -> STARTING -> STREAMING -> DRAINING -> ENDED`。`STARTING` 失败直接 `ENDED`；`STREAMING` 中 segment 级错误保持 `STREAMING`；`audio.end` 进入 `DRAINING`；protocol violation、WebSocket 断开、Speech session cancellation 或进程 shutdown 从任意活动状态进入 `ENDED`。每个连接最多一个 session，每个 session 最多一个 recognizer 和一个在途 Foundry request；不同连接独立并发。

进程收到 `SIGTERM` 后停止接受新连接，向现有连接发送不含内容的 `session.error`，取消 Azure 调用并关闭连接，然后退出。滚动发布不承诺跨实例恢复会话；浏览器可显式重新开始新 session。

## Interface 与契约（Contract）

### HTTP

- `GET /` 与静态资源：返回构建后的 React app。
- `GET /health/live`：进程事件循环可响应时返回 `200 {"status":"ok"}`。
- `GET /health/ready`：启动配置、合格 locale 清单和 adapter 初始化已通过时返回 200；否则 503。不得通过实时发送客户内容验证 Azure。
- `GET /api/v1/capabilities`：返回 `protocolVersion`、固定音频格式和不含凭据的候选 locale 清单，供 UI 展示/诊断；不是用户选择源语言的入口。
- `GET /api/v1/stream`：仅接受 WebSocket upgrade、允许的同源 Origin 和子协议 `stream-translation.v1`；其他请求返回 400/426。

所有 JSON 使用 UTF-8。client request 与 client-to-server WebSocket message 的 schema 封闭，未知字段、未知消息类型或未知必填字段组合被拒绝；server response 可按 v1 兼容性规则增加 optional 字段。HTTP 错误响应只含稳定 code 与 correlation id，不回显输入或供应商错误。

### WebSocket v1

控制消息是 JSON text frame，公共 envelope 为：

`{"version":1,"type":"...","sessionId":"...","sequence":0,"payload":{...}}`

- client `session.start`：首条消息；payload 必须为 `audioFormat="pcm_s16le"`、`sampleRateHz=16000`、`channels=1`。server 返回 `session.started`，包含同一协商格式。
- client `audio.end`：声明输入结束；之后任何 binary frame 均为 protocol violation。
- server `subtitle.partial` / `subtitle.final`：payload 为 `segmentId`、`detectedLocale`、`textZh`；sequence 是 session 内字幕事件序号。
- server `segment.error`：payload 为可关联的 `segmentId`、`stage`、稳定 `category`、`recoverable=true`；不含识别或翻译内容。
- server `session.error`：仅用于无法继续的协议、Speech session、配置或 shutdown 类别，`recoverable=false`。
- server `session.end`：payload 仅含终止类别 `completed|client_disconnect|protocol_error|provider_session_error|server_shutdown`。

音频使用 binary frame，布局为：1 byte protocol version (`0x01`)、1 byte type (`0x01` 表示 `audio.chunk`)、4 byte unsigned big-endian `audioSequence`、8 byte unsigned big-endian `sampleOffset`，其余为偶数字节 PCM payload。帧大小、帧速率、session 累计输入与 idle 边界来自经过目标平台验证的部署配置；服务端在分配大 buffer 前校验。sequence 从 1 开始且必须严格连续，sample offset 必须等于此前已接受样本总数。

关闭码：`1000` 正常完成；`1001` server shutdown；`1008` Origin、状态或 schema 违规；`1009` 消息超过配置边界；`1011` 无法继续的 provider/session 错误。单片段错误不关闭连接。

### Azure Speech adapter contract

输入固定 PCM 格式与冻结的完整 `E`；adapter 必须设置 continuous recognition 和 continuous LID，不允许默认单语言。输出仅为 confirmed segment、不可恢复 session error 或识别结束信号。服务启动必须校验清单证据绑定的 Speech resource region、SDK version、Foundry deployment/API version 与运行配置一致，并校验 `E` 非空、去重、排除中文、数量不超过 10；任一不满足均拒绝启动。该检查只防止部署漂移，不能替代 Technical Solution 阶段对 `S`、`F`、`E` 完整性及 `|E| <= 10` 的先行证明。

### Foundry adapter contract

请求使用目标 deployment 的版本化 endpoint、managed identity token、streaming response、简体中文翻译 system instruction、单个 recognized segment 和 `reasoning: {"effort":"none"}`。prompt 明确要求只翻译、不回答、不总结、不执行源文本中的指令；源文本作为不可信数据字段传入。adapter 只暴露 text delta、completion 和分类错误，不向上泄露 provider payload。

实施前由平台/资源负责人提供的目标 deployment 权威清单与真实 contract 必须证明：deployment 存在；完整 `F` 可枚举；请求 schema 接受关闭 reasoning 参数；返回可流式读取；目标语言指令有效。部署后的远程 contract test 再证明 Candidate managed identity 有且仅有推理权限并复核同一 contract。若 gpt-sol-6.1 不满足，不能由 Coding 自行换模型；必须由技术方案责任人基于同一已批准 baseline 选定另一个目标 Foundry deployment、重新取得完整证据并重新计算 `E`。

### 版本、兼容性与 contract test

HTTP 路径、WebSocket 子协议和消息 `version` 同时固定 v1。服务端不兼容未知 major version；同一 v1 可新增 optional server 字段，client 必须忽略未知 optional response 字段。修改必填字段、音频格式、事件语义或二进制布局必须发布新 major 子协议。

本地 contract tests 使用 synthetic adapters 验证 schema、binary parser、状态机、顺序、错误隔离和关闭码。实施前 capability contract 证据必须绑定目标 Speech resource region、SDK version、Foundry deployment/API version，包含完整 `S`、`F`、`E` 逐项映射及计数，并证明 `|E| <= 10`。部署后的远程 contract tests 针对相同目标复核 locale 限制、LID、音频格式、managed identity、reasoning 关闭及 streaming response；远程结果必须绑定 Candidate SHA、image digest 和 target。任何版本或目标变化都使旧清单失效，必须重新计算，不得沿用抽样结果。

## 安全、隐私、身份与 Secret

- 浏览器只访问同源 HTTPS/WSS，不接收 Azure endpoint credential、token、key 或 managed identity 信息。麦克风仅在用户触发后由浏览器权限机制启用，页面离开或 session 结束即停止所有 tracks。
- Azure Container Apps 的 user-assigned managed identity 分别授予目标 Speech resource 使用权限与 Foundry deployment 推理所需最小 data-plane role；不得授予资源创建、deployment 管理或订阅级权限。
- 本地开发可使用 Azure Developer CLI/Azure CLI 的开发身份或环境 secret；production 禁止 key fallback。配置层拒绝把 credential 放入 client-prefixed Vite variables。
- WSS upgrade 校验精确允许 Origin；CSP 限制 `default-src 'self'`、`connect-src 'self'`，并设置适用的 `frame-ancestors 'none'`、`object-src 'none'`、`base-uri 'self'`。不新增登录或角色行为。
- JSON、binary header、locale 配置和模型输出均做运行时 schema 检查。输入文本被视为不可信数据，不能覆盖 system instruction；字幕通过 React text node 渲染，禁止 `dangerouslySetInnerHTML`。
- 音频、识别文本与译文只在内存中存在到当前处理完成；不写磁盘、cache、analytics 或日志。crash/error handler 也不得序列化 request body、binary frame、prompt 或 provider response。
- correlation id、session id 和 segment id 均为随机不透明标识，不编码用户、会议或内容信息。日志对 provider 错误采用稳定映射类别。

## 配置、可观测性与运维

必需 server 配置：`PORT`、`PUBLIC_ORIGIN`、`AZURE_SPEECH_ENDPOINT`、`AZURE_SPEECH_REGION`、`AZURE_SPEECH_SDK_VERSION`、`SPEECH_CANDIDATE_LOCALES`、`ELIGIBLE_LANGUAGE_MANIFEST_DIGEST`、`AZURE_FOUNDRY_ENDPOINT`、`AZURE_FOUNDRY_DEPLOYMENT`、`AZURE_FOUNDRY_API_VERSION`、`MAX_AUDIO_FRAME_BYTES`、`MAX_SESSION_AUDIO_BYTES`、`MAX_PENDING_SEGMENTS`、`WS_IDLE_TIMEOUT_MS`、`FOUNDRY_REQUEST_TIMEOUT_MS` 和 `SHUTDOWN_GRACE_MS`。除 `PORT=8080` 外，环境相关值必须由 `runtime/deployment.json` 声明来源并在启动时校验；`SPEECH_CANDIDATE_LOCALES` 必须与经批准 manifest 的 `E` 完全相等。安全边界数值须依据目标 Azure、浏览器和 Container Apps contract 记录在部署配置，不作为验收阈值。production identity 不接受静态 key 配置。

结构化 JSON 日志输出到 stdout/stderr，字段限于 timestamp、level、event、correlationId、sessionId、segmentId、provider、durationMs、count、errorCategory 和 process/container metadata。禁止 message body、音频、locale 对应文本、prompt、response 和 secret。事件包括 session 状态转换、Speech/Foundry 调用开始与分类结果、segment 成功/失败计数、WebSocket protocol violation、readiness 和 shutdown。

应用暴露进程内聚合的非内容 counters/timers（活动 session、已接收 frame、confirmed segment、subtitle final、按类别错误和 provider duration），由平台 stdout/内建采集能力消费；本迭代不新增 telemetry backend、dashboard 或告警产品。health endpoint 仅证明进程与配置状态，不能证明翻译验收。

## SLO、限制、扩缩容、重试与恢复

没有获批准的数值 SLO。唯一用户可见时序门禁是字幕在持续语音结束前出现并继续更新。实现和证据保留首次字幕、后续字幕与 audio end 的单调时间先后关系，但不据此增加固定延迟承诺。

输入帧、累计音频、pending segment、idle、provider request 和 shutdown 边界均是防止无界资源占用的部署参数；其值必须来自目标 SDK/API、Container Apps 或实测资源 contract，并由配置校验，不写成产品能力。超过边界的处理遵循既定 protocol 或 segment error，不将该输入计为成功。

每个实例承载多条互相隔离的 WebSocket，每连接固定一个 recognizer 和至多一个在途翻译请求。Container Apps 可按活动连接/平台负载扩缩，但不声明 min/max replica 或并发目标；扩容不需要共享 state。缩容和 rollout 中已有连接按平台 grace period 结束，不能迁移。

Speech SDK 的连接重试仅使用 SDK 对建立连接的安全默认行为；应用不重放已经写入 push stream 的音频。Foundry 对同一 segment 不自动重试，避免重复费用、乱序和不可判定的重复字幕；失败发 `segment.error` 后处理下一 segment。浏览器连接断开后不自动声称恢复旧 session，用户可开始新 session。平台实例失败通过不可变 image 重建；由于无持久数据，无数据恢复或迁移步骤。

## 部署拓扑、迁移、Rollout 与 Rollback

Vite 先生成静态资源，TypeScript server 生成 Node.js 产物；multi-stage `Dockerfile` 在 clean builder 安装锁定依赖、构建 client/server，再把 production dependencies 与产物复制到 Node.js 22 非 root runtime image。image 不包含 source map、测试 fixture、开发 credential 或本地录音。

Azure Container Apps revision 运行单容器并启用 WebSocket、HTTPS-only ingress、port 8080 和 managed identity；配置通过 secret reference/环境变量注入，Azure endpoint 本身可为普通配置，任何 secret 不进入 revision template 明文或仓库。网络只需浏览器 ingress 以及 Speech/Foundry HTTPS 出站；不新增 database、queue 或外部 telemetry。

本迭代无数据 schema 或持久化迁移。在 Coding 前必须先解除“开放决策”中的上游阻塞；不得让 Coding 通过选择资源、模型或语言子集解除。解除后，把批准的完整 `S`/`F`/`E` manifest 纳入 Candidate 配置 contract。部署前对同一目标执行真实 adapter contract tests并复核该 manifest；随后构建一次不可变 image，记录 commit SHA 与 digest，部署同一 digest。新 revision readiness 成功后切换流量；旧 revision 的既有连接按 grace period 结束或收到明确 server shutdown。若 health、contract 或功能验证失败，将流量切回上一不可变 digest；当前 WebSocket 重新开始，不恢复历史字幕。

`runtime/deployment.json` 必须把 image、Candidate SHA、QA target、developer setup/validation commands 和环境配置 contract 指向同一 Candidate。未来才产生的 SHA、digest、target 和 QA 结果由平台阶段填充，不是 Coding 前置阻塞。

## 验证环境责任矩阵（Verification Environment）

| 验证类型 | 责任阶段 | 环境来源 | 依赖/凭据 | Coding 证据 | 下游结果 |
|---|---|---|---|---|---|
| 完整语言集合与单会话可行性 | Technical Solution（Coding 前） | 平台批准的目标 Speech resource/region、SDK version 与 Foundry deployment/API version | 平台/资源负责人提供的官方能力导出和真实只读 contract 结果；不由 Coding 选择 | 不适用；该行通过前禁止 Coding | 完整 `S`、`F`、`E` 逐项映射、确定时点、来源、`|E|` 与 `|E| <= 10` 结论；否则严格返回上游 |
| TypeScript/ESLint 静态检查 | Coding | 本地 clean-compatible Node.js 22 | `npm ci`，无 Azure 凭据 | 命令、退出码、stdout/stderr | CI 对同一 SHA 重跑结果 |
| Production build 与 OCI build | Coding / 平台 CI | clean runner 与 container builder | 锁文件、Docker runtime，无 Azure 凭据 | client/server build、image 本地启动和 health 记录 | 不可变 image digest |
| 状态机、schema、序号、错误隔离 | Coding | Vitest + synthetic adapters | 人工 fixture，无云凭据 | FR-001 至 FR-006 对应测试结果 | CI developerTests 结果；不作为 IQA 通过 |
| 本地流式用户路径 | Coding | Playwright、浏览器和 synthetic adapters | 合成音频，不访问 Azure | 输入结束前 partial/final 更新及失败后恢复记录 | CI 可重复的辅助 functional 结果 |
| Speech adapter contract | 远程 integration | 已批准目标 Azure Speech 测试资源 | managed identity、RBAC、完整候选 locale、可核对音频 | adapter contract test 与执行说明 | 实际格式、continuous LID、locale/区域/数量限制和错误 contract 结果 |
| Foundry adapter contract | 远程 integration | 已批准 Foundry project/deployment | managed identity、RBAC、部署 endpoint | adapter contract test 与执行说明 | 模型存在、关闭 reasoning 参数、streaming 中文响应和错误 contract 结果 |
| IQA-001 自动检测与中文字幕 | Independent QA | 部署的精确 Candidate + 真实 Azure 测试服务 | QA target、真实浏览器麦克风或可核对流式音频、批准身份 | 可执行场景、非内容 correlation 机制 | 可关联源语音、检测 locale、中文字幕及语义判定 |
| IQA-002 完整语言覆盖 | Independent QA | 与 Candidate 相同的 Speech/Foundry target | 带时点完整合格交集及逐语言音频 | 自动逐语言执行入口与证据格式 | 完整清单逐项结果；不得抽样 |
| IQA-003 持续流式字幕 | Independent QA | 部署的精确 Candidate + 真实服务 | 足以产生多 segment 的持续音频 | client 记录先后关系的能力 | 输入结束前首次字幕、后续更新和结束时点证据，不使用固定延迟 |
| IQA-004 错误后恢复 | Independent QA | 部署的精确 Candidate + 真实服务 | 不可翻译输入后接合格音频 | segment error 与后续字幕关联能力 | 首段未计成功且后段重新满足 IQA-001/IQA-003 |
| 发布候选一致性 | Release verification | 平台 artifact 与部署记录 | GitHub/registry/deployment metadata | `runtime/deployment.json` contract | SHA、image digest、target、QA 证据同一 Candidate |

## 快速验证指南（Quickstart）

当前 `implementationReady=false`，不得执行 Coding quickstart。解除阻塞后按以下固定步骤验证：

1. 先核对批准的 capability manifest：目标 resource/region、SDK version、deployment/API version 与环境一致，`E=S∩F` 逐项完整且 `1 <= |E| <= 10`；任何缺失或超限立即停止并返回 Technical Solution/上游，不得缩减清单。
2. 在 Node.js 22 clean 环境执行 `npm ci`，再按 `runtime/deployment.json` 的 `developerValidationCommands` 顺序运行 static analysis、build 和 developer tests；这些命令不得访问 Azure。
3. 以 synthetic adapter 模式启动 production build，确认 `/health/live`、`/health/ready`，在受支持浏览器打开页面并允许麦克风。
4. 输入持续的合成外语音频，确认无需选择源语言，输入仍进行时已出现中文 `subtitle.partial`/`subtitle.final`，随后内容继续产生更大的字幕 sequence。
5. 注入一个 detection/recognition/translation segment failure，确认该段只产生 `segment.error`，同一连接的后续合格输入仍产生中文流式字幕。
6. 在 remote integration 环境使用 Candidate managed identity 分别执行 Speech 与 Foundry contract tests；复核完整 `E`、continuous LID、固定 PCM、Foundry deployment、`reasoning.effort=none` 和 streaming response 的实际 contract。
7. 只在上述 contract 成立后部署同一 image digest，由 Independent QA 按 IQA-001 至 IQA-004 验收；IQA-002 使用当时完整交集逐语言执行，IQA-003 只判断事件先后关系。保存 Candidate SHA、digest、target 和证据映射。

## 支持 Runbook

- **readiness 失败**：检查配置 schema、候选 locale 去重/中文排除、Speech SDK 支持限制、Foundry endpoint/deployment 与 managed identity token 获取；不得打印配置值或 token。修复配置后创建新 revision。
- **无法开始听录**：用 correlation id 检查 `speech.connection`/`speech.contract` 类别、目标 region、RBAC 和 PCM contract；用非客户合成音频执行远程 contract test。
- **无字幕但 STT 成功**：检查 `translation.auth`、`translation.contract`、`translation.output_invalid` 或 timeout 类别；确认部署接受关闭 reasoning 参数和 streaming。不得把识别文本复制到工单或日志。
- **语言检测错误或语言缺失**：比较 Candidate 冻结的 `S`/`F`/`E` manifest、运行配置和目标 Speech/Foundry contract；任何语言缺口都使 IQA-002 失败，不能通过抽样、固定语言、候选轮换、并行猜测或让用户预选规避。若目标变化导致 `|E| > 10`，停止发布并按严格上游例外处理。
- **单片段错误后会话终止**：视为 FR-006 回归，检查 coordinator 是否把 recoverable segment error 错映射为 session error；复现时使用人工 fixture。
- **字幕乱序/重复**：按 session/segment/subtitle sequence 和非内容事件定位；确认每 session 单一串行翻译消费者，禁止从日志恢复客户内容。
- **资源压力**：检查活动连接、buffer/queue counter 和协议关闭类别；依据目标平台 contract 调整部署保护配置或 replica 策略，不宣称新的产品并发/SLO。
- **发布回退**：停止向问题 revision 分配新流量，切回上一不可变 digest；现有连接明确结束并由用户开始新 session。记录 SHA、digest、revision 和错误类别，不记录音频或字幕。
- **凭据疑似泄露**：停止受影响 revision，撤销相关 identity assignment/credential，审查只含 metadata 的平台日志并重新部署；不得在工单中粘贴 secret 或客户内容。

## 开放决策

- **OD-001（上游阻塞，不得交给 Coding）**：缺少目标 Azure Speech resource/region、Speech SDK 精确版本、目标 Foundry deployment/API version，以及据此生成的带日期完整 `S`、`F`、`E` 权威能力清单和真实 contract 证据，当前无法证明 `1 <= |E| <= 10`。平台/资源负责人必须提供这些目标及证据；Technical Solution 责任人据此复核交集。若 `|E| <= 10`，可保持 TD-004 并将方案更新为实施就绪；若 `|E| > 10` 或 `F` 无法权威枚举，则 FR-005/AC-002 与已批准 technical baseline 客观不兼容，必须按 Constitution 的严格上游例外返回业务/技术基线审批，Coding 不得预选、抽样、并行猜测、替换 provider 或自行缩小范围。
