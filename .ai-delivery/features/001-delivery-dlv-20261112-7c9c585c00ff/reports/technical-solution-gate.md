# Technical Solution 阶段门禁报告

## 门禁信息

- **阶段：** `technical-solution`
- **检查轮次：** 4
- **当前制品：** `design.md`
- **直接前置制品：** `spec.md`、`technical-baseline.md`
- **结论：** `需要修复`

## 内部自检

已检查技术上下文、治理约束、完整语言交集、架构与决策、数据模型、机器可读根路径、忽略策略、状态与并发、接口契约、安全与配置、部署回滚、验证责任、Quickstart、Runbook 和开放决策。组件边界、接口、生命周期、安全约束、部署路径、测试策略与验证环境责任内部一致；设计也已准确限定 Coding、远程 integration 和 Independent QA 的证据责任。

当前制品明确标记 `implementationReady: false`，并证明其实施就绪依赖已批准前置义务中尚未确定的业务所采用翻译能力及目标 Azure contract。`design.md` 已作出其权限内的具体决策，包括 `E = S ∩ F`、单一 continuous LID recognizer、`1 <= |E| <= 10` 的可行条件及禁止 Coding 缩减或猜测语言集合；剩余阻塞不能由 Technical Solution 在不选择目标资源、替代模型或改变产品语言范围的情况下自行消除。

## 直接前置一致性检查

已逐项对照 `spec.md` 的 FR-001 至 FR-006、SC-001 至 SC-003、AC-001 至 AC-005、IQA-001 至 IQA-004，以及已批准 `technical-baseline.md`。自动检测、中文字幕、流式先后关系、失败后恢复、真实 Azure 验证和 Candidate 一致性均有对应设计，未发现 Technical Solution 对清晰产品行为的削弱、违背、遗漏或扩张。

上一轮 `TS-SELF-001` 要求 Technical Solution 取得目标资源证据并完成可行性闭合。本轮复核确认 `design.md` 已把所有可由本阶段决定的条件闭合，并明确证明缺失内容属于前置制品未确定的目标能力身份及其人工作出的资源/deployment 决定。继续把同一根因路由为 `current_stage` 会要求本阶段越权选择业务所采用能力或修改完整语言覆盖义务，形成重复修复循环。因此，本轮按严格契约将根因归类为 approved Specification 的重大歧义并路由上游。

## 阻塞项

### TS-PRED-001 “业务所采用翻译能力”未被批准为可确定的目标，导致完整合格语言集合无法实施

- **严重性：** `high`
- **范围：** `predecessor`
- **制品：** `spec.md`
- **责任 Agent：** `specification`
- **路由：** `upstream_exception`
- **原因类型：** `ambiguity`
- **证据：** `spec.md` 第 29、38、116、140、192、206 行把 FR-005、AC-002 和 IQA-002 的完整覆盖范围定义为“业务所采用翻译能力”可自动检测且可翻译为中文的全部非中文语言，但没有批准该能力的确定身份或可判定选择。`technical-baseline.md` 第 9、17、18、22、24 行仅规定 Azure Speech 与 Azure AI Foundry，并把 gpt-sol-6.1 保留为需验证的候选，同时要求使用目标 resource/region、SDK、deployment/API contract 证明完整交集和单会话兼容性。`design.md` 第 15、30 至 38、155 至 167、203、211、226 至 234、248 至 250 行已穷尽本阶段权限：定义 `S`、`F`、`E`，记录 Azure continuous LID 最多 10 个候选语言，并禁止自行选择资源、模型、语言子集或替代方案；但在上游未确定目标能力前，`E` 与 `|E|` 不可计算，既不能证明实现可行，也不能生成 IQA-002 的完整范围。不同合法目标会产生不同语言集合，且可能分别得到 `|E| <= 10` 或 `|E| > 10`，实质改变产品契约能否由已批准架构实现。
- **修复建议：** 由 Specification 责任人协调业务与已批准技术基线的人工决策，明确“业务所采用翻译能力”的可核验目标及其语言范围来源，使完整 `E` 可唯一计算；若目标 contract 得到 `|E| > 10` 或无法权威枚举 `F`，必须由有权审批者明确修改产品覆盖义务或 technical baseline。完成上游批准后，Technical Solution 仅据批准结果复核 `E`、更新可行性结论和 `implementationReady`，不得由 Coding 预选、抽样或猜测。

## 通过条件

上游批准内容必须消除 TS-PRED-001：为“业务所采用翻译能力”提供唯一、可核验的目标与完整语言范围，且与 technical baseline 共同形成可实施义务。随后 Technical Solution 应依据该批准结果完整计算 `S`、`F`、`E`，证明所选架构可满足批准后的覆盖义务，将 `implementationReady` 更新为 `true`，并重新通过内部自检及直接前置一致性检查。
