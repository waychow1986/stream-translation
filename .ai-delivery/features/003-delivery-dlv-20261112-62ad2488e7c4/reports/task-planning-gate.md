# Task Planning 阶段门禁报告

## 门禁信息

- **阶段：** `task-planning`
- **检查轮次：** 1
- **当前制品：** `tasks-implementation.md`
- **直接前置制品：** `design.md`
- **结论：** `需要修复`

## 内部自检

- 已检查全部 29 项任务的准确路径、依赖顺序、并行标记、test-first 顺序和完成证据。
- 任务路径均位于 `design.md` 批准的根路径内，Setup、Foundational、US2、US1、Polish 的总体依赖顺序没有形成循环。
- Azure 真实结果被正确留给部署后的 Independent QA，任务没有虚构凭据、目标资源、Candidate 身份或验收结果。
- 当前任务集仍遗漏若干实现与验证工作，且本地 synthetic 验证链无法按现有任务描述执行，因此尚未达到 Coding 交接就绪状态。

## 直接前置一致性检查

- 已逐项对照 `design.md` 的组件边界、Speech/Foundry contract、安全身份、生命周期、部署拓扑、验证责任矩阵和 Quickstart，并以 `spec.md` 的 IQA-001 至 IQA-003 仅作验收场景追踪核对。
- FR-001 至 FR-005 的主要应用路径及 AC-001 至 AC-004 的本地辅助测试已有任务承接；`Dockerfile`、active Feature 的 `runtime/deployment.json` 和分类验证命令也已纳入。
- 但任务未完整承接静态 Web app 提供、Speech managed identity token 生命周期、graceful shutdown/drain、可注入 synthetic adapters，以及真实服务端到端验收入口等明确 Design 义务。
- `design.md` 对上述义务已有明确且可执行的决定，不满足严格上游例外条件；所有阻塞项均归属 `task-planning`。

## 阻塞项

### TASK-COV-001 缺少生产环境静态 Web app 提供任务

- **严重性：** `high`
- **范围：** `self`
- **制品：** `tasks-implementation.md`
- **责任 Agent：** `task-planning`
- **路由：** `current_stage`
- **原因类型：** `coverage`
- **证据：** `design.md` 第 31 至 34、147 至 154、263 行要求 Fastify 从同一容器提供静态前端并形成 Browser → Session gateway 链路；T003 只创建 HTML shell，T012 只建立 health、日志和 Fastify 基础入口，T025 只实现 WebSocket handler，T027 只把 `dist/client` 放入 image，没有任务实现或验证 Fastify 对前端构建产物及入口 fallback 的提供。
- **修复建议：** 在相应生产实现任务之前增加静态文件提供的失败测试，再增加 `src/server/` 内的实现任务，并把 production build/image 中可访问 Web app 的确定性证据纳入完成条件。

### TASK-COV-002 Speech adapter 未承接 managed identity token 获取、刷新及验证

- **严重性：** `high`
- **范围：** `self`
- **制品：** `tasks-implementation.md`
- **责任 Agent：** `task-planning`
- **路由：** `current_stage`
- **原因类型：** `coverage`
- **证据：** `design.md` 第 203 至 209 行明确要求 `DefaultAzureCredential` 获取 Speech scope token，并在到期前刷新 Speech configuration；T013 未测试身份或刷新行为，T016 仅列出 PCM、continuous recognition/LID、候选集合、输出过滤和 cancellation 重建，未安排 token 获取、刷新实现或对应完成证据。T014 的远程 managed identity 结果不能替代缺失的生产实现任务。
- **修复建议：** 在 T016 前增加 token 获取与到期刷新边界的定向测试任务，并明确扩充 Speech adapter 实现任务及其通过证据，同时保持真实 RBAC 与 endpoint 验证属于 Independent QA。

### TASK-EXEC-003 本地 synthetic functional 与 OCI image 验证链不可执行

- **严重性：** `high`
- **范围：** `self`
- **制品：** `tasks-implementation.md`
- **责任 Agent：** `task-planning`
- **路由：** `current_stage`
- **原因类型：** `incomplete`
- **证据：** `design.md` 第 223、275 至 276、286 至 294 行要求 synthetic adapters 实现与 Azure adapters 相同接口、仅由测试 dependency injection 启用，并要求本地 production build 和 OCI image 重放 synthetic functional 场景。T015 仅创建独立 `synthetic-server.ts`，没有 Speech/Translation synthetic adapter 或服务端 test DI 装配任务；T029 又要求启动 OCI image 后重放 synthetic 场景，但没有说明该 image 中的应用如何获得 synthetic provider，因此依赖链无法按任务描述完成。
- **修复建议：** 先增加 synthetic adapter 合约测试，再增加测试专用 adapter 与服务端注入装配的准确路径和实现任务；明确安全的启用边界，并让 T029 的 image 场景实际经过该 image 内的 Fastify/WebSocket 应用，而不是绕过 Candidate。

### TASK-COV-004 缺少真实 Azure 上 IQA-001 至 IQA-003 的端到端可执行入口

- **严重性：** `high`
- **范围：** `self`
- **制品：** `tasks-implementation.md`
- **责任 Agent：** `task-planning`
- **路由：** `current_stage`
- **原因类型：** `coverage`
- **证据：** `design.md` 第 22、277 至 281、295 至 296 行要求同一不可变 Candidate 在真实 Speech 与 Foundry 服务上执行 IQA-001 至 IQA-003，并要求 Candidate 提供可执行测试入口及输入阶段、结束边界、顺序、语言和字幕证据。T014、T021 只覆盖两个 provider 的独立 remote contract/integration；T015、T022 明确依赖 synthetic server，仅是本地辅助场景。当前没有任务创建针对已部署 Candidate、同时经过真实 Speech 与 Foundry 的 functional/end-to-end 入口和三项 IQA 证据采集。
- **修复建议：** 增加 Independent QA 可在已部署 Candidate 上启用的 IQA-001 至 IQA-003 自动化入口任务，明确准确路径、目标选择边界、真实音频输入及必需证据格式；Coding 只验证入口可发现且默认不访问 Azure，真实结果继续由下游产生。

### TASK-COV-005 graceful shutdown、drain 与 SIGTERM 证据不完整

- **严重性：** `high`
- **范围：** `self`
- **制品：** `tasks-implementation.md`
- **责任 Agent：** `task-planning`
- **路由：** `current_stage`
- **原因类型：** `coverage`
- **证据：** `design.md` 第 257、267、282 行要求 SIGTERM 后 health 变为 503、停止新连接、在 grace period 内 drain，并在期限后取消 provider 工作；Coding 需提供 `/healthz`、SIGTERM/drain 行为及 deployment contract 证据。T006 只测试状态机关闭清理，T008/T012 只覆盖 health shutdown 状态，T025 仅笼统要求 shutdown 清理，T029 没有执行 SIGTERM、拒绝新连接、在途 drain 或超时取消场景。
- **修复建议：** 在生产生命周期实现之前增加覆盖 SIGTERM、503、拒绝新连接、队列 drain 和超时取消的测试任务，明确扩充 Fastify 生命周期实现任务，并在 T029 中加入可重放的 image 级 shutdown/drain 完成证据。

## 通过条件

- 为上述五项明确 Design 义务补齐 test-first 任务、生产实现任务、准确路径、依赖关系及可重放完成证据。
- 修复后重新核对每个新增或修改路径均受 `design.md` 根路径清单支持，并确认本地测试不访问 Azure、远程 IQA 不以 synthetic 结果替代。
- 所有审批阻塞项消除后，方可将 `task-planning` 标记为通过并交接 Coding。
