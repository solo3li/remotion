// AgentPulse 人机桥 —— 员工要问人的时候，问到真人身上。
//
// 补的是 dsh 两个"只定契约、不给实现"的接缝（P0 实测确认二者都缺同一半）：
//   ctx.userQuestions  —— 员工发问 / 方案审阅。缺 provider，报 NO_PROVIDER。
//   'approval/request' —— 危险动作拍板。缺 answerer，waterfall 落到 fail-closed。
// 两者都转成一次 HTTP 调用打回 AgentPulse，由老板在任意一端回答。
//
// 同时注册一个公司自己的工具 `pull_in_colleague`（ADR 0023 决策一：员工也能拉人）。
// 走 ctx.tools 而不是 MCP —— `dsh-mcp` 不在 bundled runtime 里（ADR 0019），而
// Cordis 插件本来就能注册工具。这也是「公司工具」这条路的样板。
//
// 为什么走 HTTP 而不是 SDK 的 wire：dsh 的 SDK server 从不主动发
// server→client 请求（协议文档称 dead capability），而我们本来就有 API。
// 插件是 Node，fetch 是内置的，P1 里 API 就在同一台机器上。少一层。

export const name = 'agentpulse-bridge'
// tools 也要注入 —— 我们自己注册公司工具（ADR 0023 的员工拉人）
export const inject = ['userQuestions', 'tools']

// dsh 的封闭审批结果集。任何其他返回值都会被 dsh 规范化成 'unavailable'，
// 所以这里也只发这四个。'allowed-once' 是唯一的放行。
const ALLOW = 'allowed-once'
const REJECT = 'rejected'
const CANCELLED = 'cancelled'
const UNAVAILABLE = 'unavailable'

export function apply(ctx, config) {
  const base = (config?.baseUrl ?? '').replace(/\/$/, '')
  const token = config?.token ?? ''
  // 谁在问。必须由启动方注入 —— 靠 session id 反查是鸡生蛋：
  // ask 发生在 Run 进行中，那时 session id 还没落库。
  const agentId = config?.agentId ?? null
  // 哪个房间。没有它，ask 只会出现在侧栏，不会出现在对话里 ——
  // 而「问答是消息」（ADR 0020）要求它落在 transcript 旁边。
  const conversationId = config?.conversationId ?? null
  const timeoutMs = config?.timeoutMs ?? 1000 * 60 * 30   // 老板可能半小时后才看手机
  const debug = (m) => { if (config?.debug) process.stderr.write(`[agentpulse-bridge] ${m}\n`) }

  if (!base) throw new Error('agentpulse-bridge requires config.baseUrl')

  /** 打回 AgentPulse。转发调用方的 signal，让取消能一路传下去。
      等老板回答的两个端点用长超时；工具类调用（拉人）用短的 —— 那边不等人。 */
  async function askBoss(path, body, signal, waitMs = timeoutMs) {
    const timer = AbortSignal.timeout(waitMs)
    const merged = signal ? AbortSignal.any([signal, timer]) : timer
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: merged,
    })
    if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`)
    return res.json()
  }

  // ── 员工发问 / 方案审阅 ──────────────────────────────────────────────
  // 直接把 dsh 的 questions 原样送出去 —— 它的 AskUserQuestionItem 就是我们
  // 聊天问答卡片的 UI 契约，不另设一套格式。
  ctx.userQuestions.registerProvider({
    async ask(request) {
      debug(`ask ${request.questions.length} question(s): ${request.questions.map(q => q.id).join(',')}`)
      const out = await askBoss('/internal/bridge/ask', {
        agent_id: agentId,
        conversation_id: conversationId,
        session_id: request.agent?.session?.id ?? null,
        questions: request.questions,
      }, request.signal)
      // 形状校验：answers 缺了会让 dsh 侧的工具拿到坏数据，宁可在这里失败。
      if (!Array.isArray(out?.answers)) throw new Error('bridge /ask returned no answers[]')
      return { answers: out.answers }
    },
  })

  // ── 危险动作拍板 ────────────────────────────────────────────────────
  // waterfall：返回结果即认领，调 next() 让给下一个 answerer。
  // 任何异常 dsh 都会收敛成 'unavailable'（fail-closed），但我们自己也显式兜住，
  // 免得把内部错误当成"老板拒绝"记进账本。
  ctx.on('approval/request', async (req, next) => {
    debug(`approval ${req.toolName} call=${req.callId ?? '-'}`)
    try {
      const out = await askBoss('/internal/bridge/approve', {
        agent_id: agentId,
        conversation_id: conversationId,
        session_id: req.agent?.session?.id ?? null,
        tool_name: req.toolName,
        call_id: req.callId ?? null,
        reason: req.reason ?? null,
      }, req.signal)
      if (out?.decision === 'approve') return ALLOW
      if (out?.decision === 'reject') return REJECT
      if (out?.decision === 'cancel') return CANCELLED
      debug(`unknown decision ${JSON.stringify(out?.decision)} -> unavailable`)
      return UNAVAILABLE
    } catch (err) {
      if (req.signal?.aborted) return CANCELLED
      debug(`approval bridge failed: ${err.message} -> unavailable`)
      return UNAVAILABLE
    }
  })

  // ── 公司工具：员工也能拉人（ADR 0023）────────────────────────────────
  // 只在知道自己在哪个房间时才给这个工具 —— 不然它无处可用。
  if (conversationId) {
    ctx.tools.register({
      name: 'pull_in_colleague',
      description:
        'Pull a colleague into this room when the work needs someone else. '
        + 'Use their name as it appears in the company. Say why in one short sentence — '
        + 'the boss sees that reason in the room. '
        + 'If the name is wrong you get the list of real names back; pick from it and retry.',
      // parameters 必须是**完整的 JSON Schema**，不是 name→schema 的映射。
      // dsh 仓库里的例子写成映射，是因为它们过了 `defineTool()` 做规范化；而
      // 树外插件 import 不到 dsh 的包（bare specifier 从本文件所在位置解析，
      // 走不到打包二进制的 node_modules），所以这里直接写规范化后的形状。
      // 写成映射的后果：生成出的 function schema 是 `type: null`，DeepSeek 拒掉
      // 整个 Run，而报错只出现在 turn/end 里，不在插件加载阶段。
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['colleague', 'reason'],
        properties: {
          colleague: { type: 'string',
                       description: "The colleague's name, exactly as the company lists it." },
          reason: { type: 'string',
                    description: 'One short sentence: why this person is needed here.' },
        },
      },
      output: {
        // required 用标准 JSON Schema 的数组形式。bundled runtime（rc7）不接受
        // 属性上的 `required: true` —— repo main 的源码是那么写的，版本不一样。
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['pulled_in'],
          properties: {
            pulled_in: { type: 'string' },
            already_in_room: { type: 'boolean' },
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      async execute(args, exec) {
        const out = await askBoss(
          `/rooms/${conversationId}/invite`,
          { agent_name: args.colleague, reason: args.reason, invited_by: agentId },
          exec.signal,
          15_000,   // 拉人不等人，别挂 30 分钟
        )
        debug(`pulled in ${args.colleague}`)
        return {
          pulled_in: args.colleague,
          ...(out?.already_in ? { already_in_room: true } : {}),
        }
      },
    })
  }

  debug(`mounted -> ${base}`)
}
