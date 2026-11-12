# Task Planning 阶段门禁报告

## 门禁信息

- **阶段：** `task-planning`
- **检查轮次：** 2
- **当前制品：** `tasks-implementation.md`
- **直接前置制品：** `design.md`
- **结论：** `需要修复`

## 内部自检

- 已检查全部 39 项任务的准确路径、依赖顺序、并行标记、test-first 顺序和完成证据；Setup、Foundational、US2、US1、Polish 的依赖图未形成循环。
- 上一轮报告的静态 Web app、Speech token 生命周期、synthetic adapter 注入、远程 IQA 入口及 graceful shutdown 五项根因均已由明确的测试、实现和验证任务实质承接，不再重复报告。
- 所有列明的改动路径均位于 `design.md` 批准的根路径内，Coding 与下游真实 Azure 验收的责任边界也已保持。
- 当前任务集仍缺少生产启动时装配真实 Azure adapters 的可执行任务，并且远程 Azure/IQA 套件缺少可获得的音频 fixture 及其准确路径，因此尚未达到 Coding 交接就绪状态。

## 直接前置一致性检查

- 已逐项对照 `design.md` 的组件边界、生产数据流、adapter contract、部署拓扑、验证责任矩阵和 Quickstart，并以 `spec.md` 的 IQA-001 至 IQA-003 仅作继承验收场景追踪。
- FR-001 至 FR-005、AC-001 至 AC-004 的主要代码与 test-first 覆盖、Production candidate 文件及分类验证命令均已纳入任务。
- `design.md` 已明确生产容器必须通过真实 Speech 与 Foundry adapters 运行，也明确远程 contract/IQA 依赖可核对流式音频；当前任务未把这两项义务闭合为可执行的准确路径和依赖。
- 上述 Design 决策清晰、可行且无治理冲突，不满足严格上游例外条件；阻塞项均归属 `task-planning`。

## 阻塞项

### TASK-COV-006 缺少生产 Azure adapter 组合根装配任务

- **严重性：** `high`
- **范围：** `self`
- **制品：** `tasks-implementation.md`
- **责任 Agent：** `task-planning`
- **路由：** `current_stage`
- **原因类型：** `coverage`
- **证据：** `design.md` 第 9 至 15、31 至 36、147 至 154、261 至 265 行要求生产容器由 Session gateway 创建并连接真实 Speech 与 Foundry adapters。T023、T032 只分别实现 adapter；T016 只创建可注入 app factory 和测试专用 synthetic 注入；T034 仅让连接使用“注入的” adapters，且准确路径不含生产入口 `src/server/index.ts`；T017 在真实 adapters 实现之前创建启停入口。没有后续任务要求生产入口实例化两个 Azure adapters、注入 app factory 并按启动/关闭生命周期管理它们。T036 与 T039 因此只能证明 image 中的 test-only harness 链路，不能证明正常容器命令存在可运行的真实 provider 组合。
- **修复建议：** 在两个 Azure adapter 实现完成后，增加生产 composition root 的定向失败测试和实现任务，列明 `src/server/index.ts` 等准确路径、配置到 adapter 的装配、启动失败与关闭清理行为，并让 production build/image 完成证据覆盖正常入口；test-only synthetic 注入边界保持不变。

### TASK-EXEC-007 远程 contract 与 IQA 套件缺少可执行音频 fixture

- **严重性：** `high`
- **范围：** `self`
- **制品：** `tasks-implementation.md`
- **责任 Agent：** `task-planning`
- **路由：** `current_stage`
- **原因类型：** `incomplete`
- **证据：** `design.md` 第 277 至 281、288 至 296 行要求 Speech contract 使用可核对流式音频，并让 IQA-001 至 IQA-003 重放连续内容、完整合格语言交集及“可识别—无可识别—可识别”输入。T020 要求逐语言真实 Speech 测试，却没有音频输入来源或依赖；T022、T030 声称从 `tests/functional/fixtures/manifest.json` 引用音频，但全部任务路径中只有 manifest，没有任何音频 fixture 路径、生成任务或由 Independent QA 注入外部 fixture 的已定义 contract。T031、T038 只能验证入口发现和证据 schema，无法使远程套件获得场景输入，因此下游不能按任务描述执行完整 contract 与 IQA。
- **修复建议：** 在远程测试入口之前增加非敏感、获准音频 fixture 的准确仓库路径及准备/校验任务，或明确设计并测试由 Independent QA 提供外部 fixture bundle 的输入 contract；覆盖逐语言、连续内容、静音/不可识别间隔和结束边界，并把 manifest 完整性及缺失输入失败纳入完成证据。

## 通过条件

- 补齐生产 composition root 的 test-first、实现路径、依赖和正常容器入口证据。
- 补齐远程 Speech/IQA 所需音频输入的准确路径或外部注入 contract，使全部入口无需临时决定即可执行。
- 重新核对新增任务路径均受 `design.md` 根路径清单支持，本地验证不访问 Azure，真实 Azure 结果仍只由下游针对同一不可变 Candidate 产生。
