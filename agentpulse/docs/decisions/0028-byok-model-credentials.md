# ADR 0028 — 模型凭证：老板自己填，加密存本机

- 日期：2026-08-22
- 状态：已实现
- 依赖：[ADR 0021](0021-employee-workstation-and-resource-leases.md)（零服务器 / 本机优先）、[ADR 0027](0027-desktop-shell-and-packaging.md)（打包）
- 解决：ADR 0027 §未做 第 1 条 —— P1 闸门「干净 Mac 跑通」的最后一个硬阻塞

## 起因

打包好的 app 从 Finder 启动，**拿不到 shell 的环境变量**。而后端一直是从 `DEEPSEEK_API_KEY` 环境变量读 key —— 开发时我从带 key 的终端启动，一直是通的；真实用户装完双击打开，界面能用、房间能建、人能招，**但员工集体沉默，而且界面上没有任何解释**。

## 决策一：只需要一把 key —— DeepSeek

员工全部跑在 dsh 上，composition 里挂的模型供应商是 `@deepseek-ai/dsh-llm-deepseek`。除它之外没有第二个外部凭证：`AGENTPULSE_RUN_TOKEN` 是我们自己签给人机桥的每 Run 令牌，进程内生成。

真发邮件、真发内容那类 provider 凭证要等业务工具门（需 npm 全量 runtime 才有 MCP）。

## 决策二：两级凭证，员工级可覆盖公司级

`model_keys` 表按 `(scope, scope_id)` 存，`scope` 是 `workspace` 或 `agent`。解析顺序：员工级 → 公司级 → 环境变量（只有开发时才有）。

为什么要员工级：贵模型只给主笔用，是真实需求。`RunContext.api_key` / `Employee.api_key` 在 [ADR 0019](0019-dsh-as-agent-runtime.md) 那会儿就通到 dsh 了，这次只是补上落库和界面。

## 决策三：明文只在两个地方存在

1. 老板在输入框里键入的那一刻（`type="password"`、`autoComplete="off"`，存完立刻从组件 state 抹掉）。
2. 交给 dsh 子进程的环境变量里。

其余一律密文：Fernet 加密，密钥是 `AGENTPULSE_HOME/secret.key`，**0600**。密钥跟着机器走、不跟着数据库走 —— 数据库被拷走也解不开。权限被放宽过则**拒绝启动**，不静默继续。

**没有任何接口能把明文读回来。** `GET /settings/model-key` 只返回「有没有」「末四位」「什么时候改的」—— 末四位只为了让老板认出自己填的是哪一把。

## 决策四：横幅比设置页靠前

没填 key 时，侧栏顶部直接是一条横幅，第一句就说清后果：「员工全部跑在 DeepSeek 上。没有它，你能建房间也能招人，但没人会回你一句话。」

不做成埋在设置页里的一个字段 —— 那等于让用户自己去猜为什么没人说话。填完横幅收成一行 `模型 key 已设置 · ····1234`，带清除。

## 关于凭证处理的一条工作约定

**这个 key 不由 AI 代填。** 本轮项目所有者在对话里贴了一把真 key 要我写进配置，被拒绝了：API key 这类凭证不代手录入，也不因为「是自己的」「已授权」而改变。做的是把入口建好让老板自己填，全程不接触明文。

顺带：**贴进对话记录的 key 按泄露处理，应当吊销重发。**

## 验证

`63 passed`，其中四条专盯这件事：

- 库里**没有明文** —— 连整个 `company.db` 文件按字节搜也搜不到。
- `GET /settings/model-key` 只有末四位；`/agents` `/rooms` `/asks` `/devices` `/health` 全部逐个搜过，都不带出明文。
- 员工级 key 正确盖过公司级。
- `secret.key` 是 0600；被 chmod 成 0644 后 `load_cipher` 抛错拒绝启动。

浏览器实测：全新 home + `env -u DEEPSEEK_API_KEY` 启动 → 横幅出现 → 存一把占位 key → 横幅收成已设置行。

## 未做

- 员工级 key 的界面（表和解析都通了，界面只有公司级）。
- `base_url` 的界面（字段已存，走代理/自建端点时才需要）。
- 换 `secret.key` 后的重填引导 —— 目前 `resolve` 会抛错要求重填，但没有界面提示。
