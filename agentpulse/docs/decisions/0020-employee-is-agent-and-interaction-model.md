# ADR 0020 — 员工就是 agent；交互模型改为「同事对话」

- 日期：2026-08-21
- 状态：已拍板（项目所有者）
- 依赖：[ADR 0019](0019-dsh-as-agent-runtime.md)（dsh 运行时）
- 修订：[ADR 0002](0002-self-built-group-discussion.md)（自研群讨论 —— 结论保留，范围缩小）、[ADR 0008](0008-human-in-the-loop-approval-model.md)（拍板制 —— 机制改变，原则不变）

## 决策一：员工就是 agent，agent 就是员工

项目所有者原话："**员工就是agent agent就是员工**"。

推论（写死，防止后续 AI 引入层级）：

1. **系统里不存在"不是员工"的 agent。** 没有编排 agent、没有主持 agent、没有 root agent。
2. **群聊是基础设施，不是参与者。** 房间由 AgentPulse 代码持有，不由某个 agent 持有。
3. **员工之间是平级同事，不是父子。** 因此**不用** dsh 的 in-process subagent 做群成员 —— 那会让"阿伦"变成"小秘的子进程"，是层级而非同事；且 in-process 子 agent 通过 `composeFrom()` 继承父的组装，**没有各自的人格**，跨会议也不存在，会直接废掉北极星④（自我学习）和⑤（没有 idle 员工）。
4. **一个员工 = 一个常驻 dsh runtime + 自己的 session 账本 + 自己的人格/技能/密钥。** 这是员工的连续身份与记忆所在。

被否的两条替代方案，记下来免得回头再议：
- ❌ 群 = 一个 root agent，员工 = 它的 subagent 分身。写得最少，但员工不再是人 —— 这是 cumora 那类产品的形状，不是本项目要做的。
- ❌ 群 = 一个员工当 root、其他员工挂在它下面。仍是层级，违反推论 3。

## 决策二：交互模型改为「同事对话」

三处改动，项目所有者全选。

| # | 旧版 | 新版 | 载体 |
|---|---|---|---|
| 1 | agent 撞危险动作 → 挂起 → 前端弹审批卡片 → 点批准/拒绝 | 员工**在群里发一条消息问老板**，老板像回同事一样回一句话 | `dsh-user-questions` + `dsh-tool-ask-user`；`dsh-user-approval` 的 fail-closed 在底下兜（非 `allowed-once` 一律拒绝） |
| 2 | 讨论 → `consensus_briefs` 行 → BRIEF_CARD → 确认门 → 才建 task | 主持员工**进 plan mode 提方案**，老板在对话里说"就这么干"，`goal` 落下去，员工自己按 goal 推进 | `dsh-plan-mode` + `dsh-goal` + `user-questions` 的 **`plan-review` intent**（dsh 原生：`detail` 是 plan markdown，`approve` 是具名的批准选项） |
| 3 | cron 去戳员工"你想点什么" | 员工揣着长期 goal 在后台自己推进，我们只管唤醒节奏 | `dsh-goal-round-driver` + `dsh-jobs`；**调度权仍在 AgentPulse 侧**（ADR 0019 硬约束 2） |

### 由此删掉的旧设计
`consensus_briefs` 表、brief 起草/修复 prompt、`validate_work_items`、`create_brief`/`confirm_brief`/`reject_brief`、审批弹窗组件、clarification 伪装路径。

### 我们仍然要自己写的（缩小后的 ADR 0002 范围）
只剩三件：**共享 transcript**、**发言路由**、**何时算讨论对齐**。估约 300–400 行（旧版 1,247 行，差额就是被 plan-mode + goal 吃掉的部分）。

## P0 实测：两个洞是同一个洞

- `dsh-tool-ask-user` 确实是模型可调的工具，员工**真的会调**（实测调了两次，参数是结构化的 `questions:[{id, header, question, detail?, options:[{label, description?}]}]`）。
- 但它返回 `Error: no user-questions provider` —— **`dsh-user-questions` 只定义接缝，provider 由 UI 宿主提供**。`dsh-user-approval` 的 answerer 同理。
- ⇒ **一个 Cordis 插件同时注册 `user-questions` provider 和 `approval` answerer，都经 SDK wire 的 server→client request 转给 AgentPulse。** 风险从两个合成一个；「员工发问」「老板拍板」「plan 审阅」三个交互共用一条链。
- Python 客户端侧的 `next_request()` / `respond()` 已验证可用（ADR 0019），wire 这半边不用我们做。
- 白捡：问答卡片的 UI 契约不用自己设计，dsh 的 `AskUserQuestionItem` 就是。
- 白捡：工具失败时模型会**自己降级成用大白话在对话里问** —— 桥没做完也不是死路。

## 待验证

1. ~~`UserQuestionProvider` / approval answerer 的确切注册 API。~~ **已解并真跑通** —— 见 [ADR 0022](0022-human-bridge.md)。
2. `dsh-plan-mode` 与 `plan-review` intent 的联动方式。
3. `goal-round-driver` 的唤醒语义与我们调度权的边界。
