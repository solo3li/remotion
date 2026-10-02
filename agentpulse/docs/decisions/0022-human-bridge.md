# ADR 0022 — 人机桥：员工问人的唯一通道

- 日期：2026-08-22
- 状态：已实现并真跑通
- 依赖：[ADR 0019](0019-dsh-as-agent-runtime.md)、[ADR 0020](0020-employee-is-agent-and-interaction-model.md)
- 解决：ADR 0019 §待验证 1、ADR 0020 §待验证 1（原「头号未解风险」）

## 背景

P0 实测发现 dsh 两个接缝**只定义契约、不给实现**，真正触达人类的那一半由 UI 宿主提供：

- `ctx.userQuestions` —— 员工发问 / 方案审阅。无 provider 时 `ask_user_question` 返回 `Error: no user-questions provider`。
- `approval/request` —— 危险动作拍板。无 answerer 时 waterfall 落到 fail-closed 的 `'unavailable'`。

**两个洞是同一个洞。** 一个插件同时补上，则「员工发问」「老板拍板」「plan 审阅」共用一条链。

## 决策一：桥不走 SDK wire，直接 HTTP 打回 AgentPulse

原设想是用 SDK 的 server→client 请求。**放弃**：dsh 的 SDK server 从不主动发这类请求（协议文档称 dead capability），要用就得撬开它内部的 peer。

而插件本身是 Node、`fetch` 是内置的，AgentPulse 又本来就有 API —— 且按 [ADR 0021](0021-employee-workstation-and-resource-leases.md)，P1 里 API 就在同一台机器上。**少一层，不碰私有内部结构。**

## 决策二：注册契约（读源码确认，非推测）

```js
export const inject = ['userQuestions']          // Cordis 必须显式注入

// 问答：单一 provider，重复注册报 DUPLICATE_PROVIDER
ctx.userQuestions.registerProvider({
  async ask({ questions, agent, signal }) {
    return { answers: [{ id, selected: [...], custom? }] }
  },
})

// 审批：Cordis waterfall 事件 —— 返回 outcome 即认领，调 next() 让给下一个
ctx.on('approval/request', async (req, next) => 'allowed-once')
// req = { agent, toolName, callId?, reason?, signal? }
```

关键语义（都来自源码，别猜）：

- `ApprovalOutcome` 封闭四值：`allowed-once` | `rejected` | `cancelled` | `unavailable`。**`allowed-once` 是唯一放行。** 返回集合外的值或抛异常，dsh 都规范化成 `unavailable`（fail-closed）。
- `policy: 'never'` 在 service 自己的 `request()` 里就决定，**任何 answerer 都拦不住** —— 这是无人值守场景的确定性拒绝。
- `userQuestions.ask()` 对**被其他 agent 拥有的子 agent** 抛 `DELEGATED_CALLER`：子 agent 没有人类应答者，会永久阻塞。这与 [ADR 0020](0020-employee-is-agent-and-interaction-model.md) 决定「不用 in-process subagent 做群成员」相互印证 —— 那条路上员工根本问不了人。
- 带 `intent` 的问题必须同时满足：`approve` 是自己 options 里的某个 label、且有 `detail`。否则 `BAD_INTENT`。`plan-review` 是 dsh 原生 intent，直接承载 ADR 0020 的「plan 审阅取代 brief 对象」。
- `AskUserQuestionItem` 直接当作聊天问答卡片的 UI 契约，**不另设一套格式**。

## 决策三：桥的失败语义

| 情况 | 行为 |
|---|---|
| 缺 `api_base` | `DshBackend` 直接拒绝启动。桥问不到人则每次审批都静默 fail-closed，那种"看起来在跑其实全拒"最危险 |
| HTTP 失败 / 超时 | 返回 `unavailable`（拒绝），且不记成"老板拒绝" |
| 调用方 abort | 返回 `cancelled` |
| 老板回了未知 decision | 返回 `unavailable` |
| 问答返回缺 `answers[]` | 抛错，不把坏数据喂给工具 |

超时默认 30 分钟 —— 老板可能半小时后才看手机。

## 验证

`services/api/tests/test_dsh_backend.py`，5 passed（`DSH_E2E=1`，真 dsh + 真 DeepSeek）：

- `test_employee_asks_the_boss_and_uses_the_answer` —— 员工被要求先问再写；桥真的打到假老板端点；送来的是 dsh 的 `AskUserQuestionItem` 形状；**老板回答的 `Zephyrnet` 出现在员工最终产出里**。用一个模型编不出来的词做断言，确保回答真的流回了模型，不只是 HTTP 被调用过。
- 另有三条常开边界测试：占位符必须渲染成绝对路径、相对 workdir 被拒、缺 `api_base` 被拒。

## 未验证

1. 真实越界动作（写 workspace 之外）触发 `approval/request` 的完整路径。`dsh-permission-presets` 需要会约束的 bash 执行器，而 `dsh-bash-sandbox` 未打包进 A 层 —— 这条留到接 `sandbox-local` / `sandbox-policy` 时验。
2. 长等待（老板几小时不回）时 dsh 侧 Run 的存活与恢复。
