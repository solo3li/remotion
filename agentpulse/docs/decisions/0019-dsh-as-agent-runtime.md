# ADR 0019 — 员工运行时改为 DeepSeek Harness (dsh)

- 日期：2026-08-21
- 状态：已拍板（项目所有者决定：删旧代码、基于 dsh 重建）
- 取代：[ADR 0001](0001-hermes-as-agent-runtime.md)（Hermes 作为运行时）、[ADR 0007](0007-hermes-v0.18-interface-acp.md)（ACP 传输）、[ADR 0015](0015-bundled-local-hermes-runtime.md)（内置 Hermes）、[ADR 0016](0016-hermes-only-employee-execution.md) 中的 Hermes 部分
- 继续有效：[ADR 0002](0002-self-built-group-discussion.md)（自研群讨论）、[ADR 0005](0005-hermes-poc-safety-findings.md)（UnitPulse 路径隔离 —— **不得外包给 dsh sandbox**）、[ADR 0008](0008-human-in-the-loop-approval-model.md)（老板拍板制）

## 决策

员工运行时从 Hermes Agent 换成 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（MIT，DeepSeek 官方，2026-08-13 发布）。传输用官方 **Python SDK**（stdio newline-delimited JSON-RPC），不用内置 ACP。

## 为什么

不是"Hermes 不好用"，是 dsh 白送了我们正在自己造的一半东西：session 账本（员工记忆/履历的真相源）、审批 seam、技能、compaction、沙箱、subagent，以及**自带打包好的 runtime 二进制**（TD-14R/15 卡最久的一项）。

选 Python SDK 而不是内置 ACP，因为 ACP 明确不上报 reasoning/tool 活动、且 `session/new` 的 `mcpServers` 非空即拒；SDK 的 `session.event` 是全量 durable fact 流。

## P0 实测事实（2026-08-21，`deepseek-harness-sdk==0.1.0rc7`，macOS arm64）

**已验证可用：**
- 真跑一轮：`final_response == 'OK'`，`finish_reason == 'completed'`。
- 事件类型（真实观察，未推测）：`agent/inbox/spliced` `turn/start` `turn/end` `step/start` `step/end` `user/message` `assistant/chunk` `assistant/message` `tool/call` `tool/result` `session/title` `request/header` `request/context`。`tool/call` 带 `callId`/`name`/`arguments`，`tool/result` 带 `callId` —— 够我们做 AgentEvent 映射。
- **自写的树外插件能加载进那个 195MB 打包二进制**（`cordis.yml` 里 `name` 写插件文件的绝对路径即可）。这是本次选型的真闸门，已过。
- `ctx.approval` 可注入，服务面为 `setPolicy` / `request` / `effectivePolicy` / `overrideOf` / `decide`。
- `cordis.yml` 支持 `!!js process.env.X` 求值 → **per-Run 值经环境变量注入，不需要每 Run 生成一次性 preset 目录**。
- `dsh-system-prompt` 的 `persona` config 键可用 → 员工 SOUL 的载体。
- `DeepSeekHarnessConfig` 可注入 `cordis` / `session_root` / `cwd` / `api_key` / `env` → 员工级隔离与 BYOK 都成立。

**已验证的坑（踩过，别再踩）：**
- `name` 位置**不能**用 `!!js process.env.X` —— loader 拿到 Object 不是 string 并 fail loud。插件路径必须在启动时渲染成字面绝对路径。
- Cordis 必须 `export const inject = ['approval']`，否则 `cannot get property "approval" without inject`。
- `dsh-session-persistence-sqlite` 要 `$.path`（文件），不是 jsonl 的 `root`（目录）。
- `dsh-permission-presets` 要求一个会约束的 bash 执行器，挂在 `dsh-bash-local` 上会 fail loud（`no sandboxMode`）。
- `strings` 抓二进制得到的插件名**不等于**真装了的包。真名单要从 pkg 文件表的 `node_modules/<pkg>/package.json` 路径提取。

**bundled Python runtime 的真实边界（110 个包）：**
- ✅ `dsh-user-approval` `dsh-tools` `dsh-tool-bash` `dsh-tool-fs` `dsh-tool-str-replace-editor` `dsh-system-prompt` `dsh-skill*` `dsh-subagent*` `dsh-goal` `dsh-compaction*` `dsh-sandbox-local` `dsh-sandbox-policy` `dsh-permission-presets` `dsh-tool-web` `dsh-web-search-*` `dsh-acp`
- ❌ **`dsh-mcp` 未打包** → TD-10/11 的公司/业务 MCP 工具在 bundled runtime 上挂不上。
- ❌ **`dsh-agent-presets` 未打包** → "一进程 N 个不同组装的员工"在 bundled runtime 上**拿不到**。
- ❌ `dsh-persona` 未打包（但 `dsh-system-prompt` 的进程级 persona 覆盖了这个需求）。
- ❌ `dsh-schedule` 未打包（本来也不用它 —— 见下）。
- ❌ **没有 Windows wheel**（只有 macos-arm64 / manylinux aarch64 / x86_64）。

## 由此确定的两层运行时

| 层 | 用什么 | 能力 | 用在哪 |
|---|---|---|---|
| **A（P1 起）** | bundled Python runtime | 一进程一员工；人格走 `system-prompt`；无 MCP | 出 v0.1.0，桌面端 macOS |
| **B（P3 起）** | npm `@deepseek-ai/dsh` 全量 | `agent-presets` + MCP；一进程 N 员工 | 百人调度、业务工具门、Windows |

`HarnessConfig.runtime_bin` / `launch_args_override` 是切换开关。**`RuntimeSpec` 抽象层不许省** —— dsh 是 rc 版本，README 自承 breaking changes。

## 硬约束（写死，防止后续 AI 改掉）

1. **`agentPresets.recompose()` 只在 agent 未产出任何内容时有效** —— 对话中途不能换工具集，否则历史里的 tool call 新组装做不出来。运行中给员工加技能 → 必须开新 session/新 Run。
2. **`dsh-schedule` 是 session-local reminder，不是 daemon** —— "a process-local owner waits only while that Session has a live root Agent"。**7×24 / idle think 的调度权留在 AgentPulse API 侧**，与 [ADR 0003](0003-server-side-24x7-idea-center.md) 一致。
3. **ADR 0005 的 UnitPulse 路径隔离检查不得删除、不得外包给 dsh sandbox。** dsh 的沙箱是它的策略，我们的隔离是我们的硬约束。
4. **群讨论协议不用 dsh 的 `experimental/agent-team` 替代。** 后者只有 roster/mailbox/任务 DAG，没有"先讨论对齐再开工"，与 ADR 0002 对 Multica 的判断同理。

## 待验证（尚未实测，别当既成事实）

1. ~~**审批请求怎么送上 SDK wire。**~~ **已解，且答案是不需要走 wire** —— 见 [ADR 0022](0022-human-bridge.md)。插件是 Node，直接 HTTP 打回 AgentPulse。`approval/request` 是 Cordis waterfall 事件（`@mode waterfall`，返回 outcome 认领 / 调 `next()` 让出）；`userQuestions` 是 `registerProvider()`。两者都已接通并真跑过。
2. `dsh-tool-fs` / `str-replace-editor` 的 config 形状。
3. B 层（npm 全量 runtime）的 MCP 与 agent-presets 实测。
4. Windows 路径。
