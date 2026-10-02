import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Agent, Ask, AskQuestion, Device, Message, ModelKeyState, RoomDetail, RoomSummary,
  Hit, Step,
  api, dayOf, hueOf, postOf, presenceOf, subscribe, timeOf,
} from "./api";

/* ── 小件 ─────────────────────────────────────────────────────────────── */

/** 公司标。几何单层 a，方形字腔 —— 跟员工标识的方形单元格同源。
    竖向错层试过两次都不行：向下读成 q、向上读成 d（字干位置是身份特征）。 */
function Mark() {
  return (
    <svg className="brand" viewBox="0 0 192 192" aria-hidden="true">
      <path fillRule="evenodd"
        d="M 96 0 A 96 96 0 1 1 96 192 A 96 96 0 1 1 96 0 Z
           M 54 48 H 138 A 6 6 0 0 1 144 54 V 138 A 6 6 0 0 1 138 144
           H 54 A 6 6 0 0 1 48 138 V 54 A 6 6 0 0 1 54 48 Z" />
      <rect x="144" y="0" width="48" height="192" />
    </svg>
  );
}

/** 头像：员工色 + 首字的实体方块。
    参照飞书/钉钉那根头像列（扫视锚点），但**不用真人照片** ——
    员工是 agent，不假装是人。色相由 id 推出，和名字颜色同源。 */
function Glyph({ name, id, boss, size }: {
  name: string; id?: string; boss?: boolean; size?: "lg" | "sm";
}) {
  const hue = id && !boss ? hueOf(id) : undefined;
  return (
    <span className={`glyph${size ? ` ${size}` : ""}`}
          data-boss={boss} data-tinted={hue !== undefined}
          style={hue !== undefined ? ({ "--hue": hue } as React.CSSProperties) : undefined}
          aria-hidden="true">
      {[...name][0] ?? "?"}
    </span>
  );
}

function Presence({ agent }: { agent: Agent }) {
  const { state, label } = presenceOf(agent);
  // 形状 + 文字，不只靠颜色
  return (
    <span className="presence">
      <span className="dot" data-state={state} />
      {label}
    </span>
  );
}

/** 把 @名字 渲染成高亮。被叫到的人要跳出来，否则 @ 只是一串普通字。 */
function withMentions(text: string, names: string[]) {
  if (names.length === 0) return text;
  // 长名字优先，避免「@阿伦」被「@阿」抢先匹配
  const sorted = [...names].sort((a, b) => b.length - a.length);
  const out: (string | JSX.Element)[] = [];
  let rest = text;
  let key = 0;
  while (rest.length) {
    const at = rest.indexOf("@");
    if (at < 0) { out.push(rest); break; }
    const hit = sorted.find((n) => rest.startsWith("@" + n, at));
    if (!hit) { out.push(rest.slice(0, at + 1)); rest = rest.slice(at + 1); continue; }
    if (at) out.push(rest.slice(0, at));
    out.push(<span className="at" key={key++}>@{hit}</span>);
    rest = rest.slice(at + 1 + hit.length);
  }
  return out;
}

function Palette({ rooms, staff, onPick, onClose }: {
  rooms: RoomSummary[]; staff: Agent[];
  onPick: (kind: "room" | "agent", id: string, seq?: number) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const [hits, setHits] = useState<Hit[]>([]);

  // 消息搜索走后端。工作聊天软件没有搜索，历史一多就等于没有。
  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) { setHits([]); return; }
    let alive = true;
    const timer = setTimeout(() => {
      void api.search(needle).then((r) => alive && setHits(r.hits)).catch(() => {});
    }, 160);   // 别每敲一个字打一次
    return () => { alive = false; clearTimeout(timer); };
  }, [q]);

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (s: string) => !needle || s.toLowerCase().includes(needle);
    return [
      ...rooms.filter((r) => match(r.title || "")).map((r) => ({
        kind: "room" as const, id: r.id, label: r.title || "未命名房间",
        group: "房间", snip: "" as string, seq: undefined as number | undefined })),
      ...staff.filter((a) => match(a.name)).map((a) => ({
        kind: "agent" as const, id: a.id, label: a.name,
        group: "员工", snip: "", seq: undefined })),
      ...hits.map((h) => ({
        kind: "room" as const, id: h.conversation_id,
        label: `${h.speaker_name} · ${h.title || "未命名房间"}`,
        group: "消息", snip: h.text, seq: h.seq })),
    ];
  }, [q, rooms, staff, hits]);

  useEffect(() => setI(0), [items.length]);

  return (
    <div className="palette-scrim" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()} role="dialog"
           aria-label="搜索房间、员工或消息">
        <input autoFocus value={q} placeholder="搜房间、员工，或者搜一句话…"
               onChange={(e) => setQ(e.target.value)}
               onKeyDown={(e) => {
                 if (e.key === "Escape") onClose();
                 if (e.key === "ArrowDown") { e.preventDefault(); setI((n) => Math.min(n + 1, items.length - 1)); }
                 if (e.key === "ArrowUp") { e.preventDefault(); setI((n) => Math.max(n - 1, 0)); }
                 if (e.key === "Enter" && items[i]) {
                   const h = items[i];
                   onPick(h.kind, h.id, h.seq);
                 }
               }} />
        {items.length === 0 ? (
          <p className="none">{q.trim().length >= 2 ? "没有匹配的" : "输入两个字开始搜"}</p>
        ) : (
          <ul>
            {items.map((h, n) => (
              <li key={`${h.group}-${h.id}-${h.seq ?? n}`} aria-selected={n === i}>
                {(n === 0 || items[n - 1].group !== h.group) && (
                  <span className="palette-group">{h.group}</span>
                )}
                <button onMouseEnter={() => setI(n)}
                        onClick={() => onPick(h.kind, h.id, h.seq)}>
                  <Glyph name={h.label} size="sm" />
                  <span className="stack">
                    {h.label}
                    {h.snip && <span className="snip">{h.snip}</span>}
                  </span>
                  <span className="kind">{h.group}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ── 在等你 ───────────────────────────────────────────────────────────── */

function summarize(ask: Ask): string {
  if (ask.kind === "approval") return `要用 ${ask.payload.tool_name ?? "工具"}`;
  return ask.payload.questions?.[0]?.question ?? "有个问题";
}

function Waiting({ asks, onPick }: { asks: Ask[]; onPick: (a: Ask) => void }) {
  if (asks.length === 0) return null;
  return (
    <div className="waiting">
      <div className="section-head">
        <span className="eyebrow">在等你</span>
        <span className="count">{asks.length}</span>
      </div>
      <ul>
        {asks.map((a) => (
          <li key={a.id}>
            <button onClick={() => onPick(a)}>
              <span className="who">{a.agent_name}</span>
              <span className="what">{summarize(a)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Ask：问答和拍板是消息，不是弹窗（ADR 0020）────────────────────────── */

function QuestionAsk({ ask, onDone }: { ask: Ask; onDone: () => void }) {
  const questions = ask.payload.questions ?? [];
  // 每个问题各自的选择。**必须全部答完才提交** —— 之前点一个选项就直接提交，
  // 剩下的问题连带答案一起丢了（老板真用时第一个撞到的就是这个）。
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const answerOf = (q: AskQuestion) => {
    const sel = picked[q.id] ?? [];
    const free = (typed[q.id] ?? "").trim();
    if (sel.length) return { id: q.id, selected: sel };
    if (free) return { id: q.id, selected: [], custom: free };
    return null;
  };
  const done = questions.map(answerOf);
  const missing = questions.filter((_, i) => done[i] === null);

  const toggle = (q: AskQuestion, label: string) =>
    setPicked((p) => {
      const cur = p[q.id] ?? [];
      if (!q.multiSelect) return { ...p, [q.id]: cur[0] === label ? [] : [label] };
      return { ...p, [q.id]: cur.includes(label)
        ? cur.filter((x) => x !== label) : [...cur, label] };
    });

  const submit = async () => {
    if (missing.length) return;
    setBusy(true);
    setErr(null);
    try {
      await api.answerQuestion(ask.id, done.filter(Boolean) as
        { id: string; selected: string[]; custom?: string }[]);
      onDone();   // 记录是 transcript 里那条消息（ADR 0020）
    } catch (e) {
      setErr(e instanceof Error ? e.message : "没送出去");
    } finally {
      setBusy(false);
    }
  };

  const isPlan = questions.some((q) => q.intent?.kind === "plan-review");

  return (
    <div className="ask">
      <div className="ask-head">
        <Glyph name={ask.agent_name} id={ask.agent_id} />
        <span className="eyebrow">
          {isPlan ? `${ask.agent_name} 请你拍板` : `${ask.agent_name} 有事问你`}
        </span>
        {questions.length > 1 && (
          <span className="ask-count">
            {questions.length - missing.length}/{questions.length}
          </span>
        )}
      </div>

      {questions.map((q, n) => (
        <div className="ask-q-block" key={q.id}>
          {questions.length > 1 && <span className="ask-n">{n + 1}</span>}
          <div>
            <p className="ask-q">{q.question}</p>
            {q.detail
              ? <div className="ask-detail">{q.detail}</div>
              : q.intent && <p className="ask-nodetail">他没附方案 —— 让他先把方案发出来再定。</p>}
            {(q.options ?? []).length > 0 && (
              <div className="ask-opts">
                {(q.options ?? []).map((o) => (
                  <button
                    key={o.label}
                    className="opt"
                    aria-pressed={(picked[q.id] ?? []).includes(o.label)}
                    disabled={busy}
                    data-tone={q.intent?.approve === o.label ? "approve" : undefined}
                    title={o.description}
                    onClick={() => toggle(q, o.label)}
                  >
                    {o.label}
                    {o.description && <em>{o.description}</em>}
                  </button>
                ))}
              </div>
            )}
            <input
              className="ask-free-in"
              value={typed[q.id] ?? ""}
              disabled={busy}
              onChange={(e) => setTyped((s) => ({ ...s, [q.id]: e.target.value }))}
              placeholder={(q.options ?? []).length ? "或者自己写一句" : "回一句话"}
              aria-label={`回答：${q.question}`}
            />
          </div>
        </div>
      ))}

      <div className="ask-foot">
        <button className="send" disabled={busy || missing.length > 0} onClick={() => void submit()}>
          {busy ? "回着" : questions.length > 1 ? "全部回复" : "回复"}
        </button>
        {missing.length > 0 && (
          <span className="ask-hint">
            还有 {missing.length} 个没答 —— 全答完才发出去
          </span>
        )}
        {err && <span className="ask-hint" style={{ color: "var(--danger)" }}>{err}</span>}
      </div>
    </div>
  );
}

function ApprovalAsk({ ask, onDone }: { ask: Ask; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const decide = async (d: "approve" | "reject") => {
    setBusy(true);
    setErr(null);
    try {
      await api.decide(ask.id, d);
      onDone();   // 见 QuestionAsk：记录是 transcript 里那条消息
    } catch (e) {
      setErr(e instanceof Error ? e.message : "没送出去");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ask">
      <div className="ask-head">
        <Glyph name={ask.agent_name} id={ask.agent_id} />
        <span className="eyebrow">{ask.agent_name} 要动真东西</span>
      </div>
      <p className="ask-q">
        他想用 <span className="mono">{ask.payload.tool_name}</span>
      </p>
      {ask.payload.reason && <p className="ask-detail">他的理由：{ask.payload.reason}</p>}
      <div className="ask-opts">
        <button className="opt" data-tone="approve" disabled={busy}
                onClick={() => void decide("approve")}>
          批准这一次
        </button>
        <button className="opt" data-tone="reject" disabled={busy}
                onClick={() => void decide("reject")}>
          不行
        </button>
      </div>
      {err && <p className="ask-detail" style={{ color: "var(--danger)" }}>{err}，再试一次</p>}
    </div>
  );
}

/* ── 空状态：教会界面，不是"暂无数据" ──────────────────────────────────── */

function FirstRun({ online }: { online: boolean }) {
  return (
    <div className="empty">
      <h2>还没有房间</h2>
      {online ? (
        <>
          <p>房间是你和员工把一件事聊明白的地方。私聊也是房间 —— 只有两个人的那种。</p>
          <ol>
            <li>先招一个员工，他会有自己的人格、记忆和工位。</li>
            <li>拉他进一个房间，说清你想干什么。</li>
            <li>他背景不清楚会问你，别替他猜。</li>
          </ol>
        </>
      ) : (
        <>
          <p>连不上后端。它跑在你自己的电脑上 —— 先把它起起来：</p>
          <ol>
            <li><code>cd services/api</code></li>
            <li><code>uvicorn app.main:app --host 0.0.0.0 --port 8787</code></li>
          </ol>
        </>
      )}
    </div>
  );
}

/** 员工这一轮干过什么。默认收起 —— 想看凭什么才展开。 */
function Steps({ steps }: { steps: Step[] }) {
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;
  return (
    <div className="steps">
      <button className="steps-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "收起过程" : `他做了 ${steps.length} 件事`}
      </button>
      {open && (
        <ol className="steps-list">
          {steps.map((s, i) => (
            <li key={i} data-kind={s.kind} data-mark={s.kind === "ask" ? "?" : "·"}>
              {s.label}
              {s.detail && <code>{s.detail}</code>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** 没填 key 时的横幅。

    打包后的 app 从 Finder 启动，拿不到 shell 的环境变量 —— 不填这里，员工会
    集体沉默而且界面上没有任何解释。所以这条横幅比任何设置页都靠前。 */
function NeedKey({ state, onSaved, compact, onExpand }: {
  state: ModelKeyState; onSaved: () => void;
  compact?: boolean; onExpand?: () => void;
}) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!state.supported) return null;

  // 消息段收成一行。必须看得见（不填就没人回话），但不该吃掉列表顶上四成。
  if (compact && !state.set) {
    return (
      <button className="needkey-line" onClick={onExpand}>
        <span className="dot" data-state="off" />
        还没填 DeepSeek key —— 员工不会回话
        <span className="needkey-go">去填</span>
      </button>
    );
  }

  if (state.set) {
    return (
      <div className="keyline">
        <span className="dot" data-state="on" />
        模型 key 已设置 · <span className="tail">····{state.tail}</span>
        <button onClick={() => void api.clearModelKey().then(onSaved)}>清除</button>
      </div>
    );
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.setModelKey(key.trim());
      setKey("");          // 立刻从内存里抹掉，不留在 state 里
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "存不进去");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="needkey" onSubmit={(e) => void save(e)}>
      <b>先填一个 DeepSeek API key</b>
      <p>员工全部跑在 DeepSeek 上。没有它，你能建房间也能招人，但没人会回你一句话。</p>
      <div className="row">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-…"
          aria-label="DeepSeek API key"
        />
        <button className="send" type="submit" disabled={busy || key.trim().length < 8}>
          {busy ? "存着" : "存"}
        </button>
      </div>
      <p>加密存在这台机器上（<span className="mono">secret.key</span>，仅本人可读）。填完不再显示。</p>
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
    </form>
  );
}

/* ── 创建表单：内联展开，不用模态框（DESIGN.md）───────────────────────── */

function HireForm({ devices, onDone, onCancel }: {
  devices: Device[]; onDone: () => void; onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [post, setPost] = useState<"cloud" | "device">("cloud");
  const [device, setDevice] = useState(devices[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.hire({
        name, persona,
        workstation: post,
        device_id: post === "device" ? device : null,
      });
      onDone();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "招不进来");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={(e) => void submit(e)}>
      <label>
        叫他什么
        <input value={name} onChange={(e) => setName(e.target.value)}
               placeholder="阿伦" autoFocus required maxLength={40} />
      </label>
      <label>
        他是干什么的
        <textarea value={persona} onChange={(e) => setPersona(e.target.value)}
                  placeholder="内容主笔。写小红书和公众号，语气偏口语，不写空话。"
                  required />
      </label>
      <label>
        工位（定了就不能改）
        <div className="pickers">
          <button type="button" className="pick" aria-pressed={post === "cloud"}
                  onClick={() => setPost("cloud")}>云员工 · 7×24</button>
          <button type="button" className="pick" aria-pressed={post === "device"}
                  onClick={() => setPost("device")} disabled={devices.length === 0}>
            本机员工 · 能动你的文件
          </button>
        </div>
      </label>
      {post === "device" && (
        <label>
          住哪台机器
          <select value={device} onChange={(e) => setDevice(e.target.value)}>
            {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      )}
      <p className="form-note">
        {post === "cloud"
          ? "不下班，但碰不到你本机的文件。"
          : "能读写那台机器上你授权的项目，你电脑开着时才上班。"}
      </p>
      {err && <p className="form-err">{err}</p>}
      <div className="form-row">
        <button className="send" type="submit" disabled={busy || !name || !persona}>
          {busy ? "入职中" : "招进来"}
        </button>
        <button className="opt" type="button" onClick={onCancel}>取消</button>
      </div>
    </form>
  );
}

function RoomForm({ staff, onDone, onCancel }: {
  staff: Agent[]; onDone: (id: string) => void; onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const { id } = await api.openRoom(title, picked);
      onDone(id);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "开不出来");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={(e) => void submit(e)}>
      <label>
        这个房间聊什么
        <input value={title} onChange={(e) => setTitle(e.target.value)}
               placeholder="养老服务号" autoFocus maxLength={80} />
      </label>
      <label>
        拉谁进来
        <div className="pickers">
          {staff.map((a) => (
            <button key={a.id} type="button" className="pick"
                    aria-pressed={picked.includes(a.id)}
                    onClick={() => toggle(a.id)}>{a.name}</button>
          ))}
        </div>
      </label>
      {staff.length === 0 && <p className="form-note">还没员工可拉，先招一个。</p>}
      {err && <p className="form-err">{err}</p>}
      <div className="form-row">
        <button className="send" type="submit" disabled={busy}>
          {busy ? "开着" : "开房间"}
        </button>
        <button className="opt" type="button" onClick={onCancel}>取消</button>
      </div>
    </form>
  );
}

/* ── 主界面 ───────────────────────────────────────────────────────────── */

export default function App() {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [staff, setStaff] = useState<Agent[]>([]);
  const [asks, setAsks] = useState<Ask[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [thinking, setThinking] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [view, setView] = useState<"rail" | "room">("rail");
  const [sheet, setSheet] = useState<Agent | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [pending, setPending] = useState<string[]>([]);   // 乐观发送：还没被服务端确认的话
  const [older, setOlder] = useState<Message[]>([]);      // 往上翻出来的历史
  const [mark, setMark] = useState<string | null>(null);  // 进房间那一刻的「读到这」
  const [seen, setSeen] = useState<Record<string, string>>({});  // 每个房间最后读到的时间
  const [palette, setPalette] = useState(false);
  const [keyState, setKeyState] = useState<ModelKeyState>({ supported: false, set: true });
  // 导航栏选哪一段。之前左栏是「在等你 + 房间 + 员工」一长条混在一起，
  // 扫不出层级 —— 现在导航栏选段，列表只显示那一段。
  const [tab, setTab] = useState<"rooms" | "staff" | "settings">("rooms");
  const [form, setForm] = useState<"hire" | "room" | null>(null);
  const [inviting, setInviting] = useState(false);
  const feed = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const refreshLists = useCallback(async () => {
    try {
      const [r, a, k, dv, mk] = await Promise.all([
        api.rooms(), api.agents(), api.asks(), api.devices(), api.modelKey(),
      ]);
      setRooms(r.rooms);
      setStaff(a.agents);
      setAsks(k.asks);
      setDevices(dv.devices);
      setKeyState(mk);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  const refreshRoom = useCallback(async (id: string) => {
    try {
      setRoom(await api.room(id));
    } catch { /* 房间没了，列表刷新会带走它 */ }
  }, []);

  useEffect(() => { void refreshLists(); }, [refreshLists]);

  useEffect(() => {
    if (!current) return;
    void refreshRoom(current);
  }, [current, refreshRoom]);

  // SSE：Mac 上说的话手机上立刻出现（三端同源的机制）
  useEffect(() => {
    return subscribe((e) => {
      const type = e.type as string;
      if (type === "speaker") {
        setThinking((e.agent_id as string) ?? null);
      } else if (type === "utterance" || type === "message") {
        setThinking(null);
        if (e.conversation_id === current) void refreshRoom(current!);
        void refreshLists();
      } else if (type === "stopped" || type === "error") {
        setThinking(null);
      } else {
        // 其他一切（招人、开房间、ask 的增删）都刷列表。
        // 之前只认 ask* 前缀，结果在 Mac 上招个人，手机根本看不到 ——
        // 三端同源就是这么漏掉的。默认刷新，别按事件名白名单。
        void refreshLists();
      }
    }, setOnline);
  }, [current, refreshRoom, refreshLists]);

  // 键盘路径。选了 Linear 当参照，就不能一个快捷键都没有。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      } else if (e.key === "Escape") {
        setPalette(false);
        setSheet(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 进房间时先把「上次读到哪」记成分割线位置，再更新已读
  useEffect(() => {
    if (!current || !room?.messages.length) return;
    setMark((m) => m ?? seen[current] ?? null);
    setSeen((s) => ({ ...s, [current]: room.messages[room.messages.length - 1].created_at }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, room?.messages]);

  // 新消息滚到底
  useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "smooth" });
  }, [room?.messages.length, thinking]);

  const memberNames = useMemo(
    () => (room?.members ?? []).map((m) => m.name), [room?.members],
  );

  /** 有没有新消息没读。侧栏不标未读，你根本不知道该点哪个房间。 */
  const unreadOf = (r: RoomSummary) => {
    if (r.id === current) return false;
    const last = r.last_text ? r.created_at : null;
    const mark = seen[r.id];
    if (!r.last_text) return false;
    return !mark || (last !== null && mark < last);
  };

  const roomAsks = useMemo(
    () => asks.filter((a) => a.conversation_id === current),
    [asks, current],
  );

  const open = (id: string) => {
    if (id !== current) { setOlder([]); setMark(null); }
    setCurrent(id);
    setView("room");
  };

  const loadEarlier = async () => {
    const first = (older[0] ?? room?.messages[0])?.seq;
    if (!current || first === undefined) return;
    const page = await api.room(current, first);
    setOlder((o) => [...page.messages, ...o]);
  };

  const quote = (m: Message) =>
    setDraft((d) => `${d ? d.replace(/\s*$/, "\n") : ""}> ${m.text.split("\n")[0]}\n`);

  // @ 补全。之前只有高亮和路由 —— 你得自己把名字打对，那不叫做完。
  const atMatch = /(^|\s)@([^\s@]*)$/.exec(draft);
  const atHits = atMatch
    ? (room?.members ?? [])
        .filter((m) => !m.is_boss && m.name.startsWith(atMatch[2]))
        .slice(0, 6)
    : [];

  const completeAt = (name: string) => {
    if (!atMatch) return;
    setDraft(draft.slice(0, draft.length - atMatch[2].length) + name + " ");
    boxRef.current?.focus();
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !current) return;
    setSending(true);
    setDraft("");
    setPending((p) => [...p, text]);   // 先上屏 —— 等服务端回来才显示，聊天会显得很钝
    try {
      await api.say(current, text);
    } catch (e) {
      setDraft(text);   // 没送出去就把话还给他，别静静吞掉
      setOnline(e instanceof Error && !/fetch/i.test(e.message));
    } finally {
      setPending((p) => p.filter((x) => x !== text));
      setSending(false);
    }
  };

  const nameOf = (id: string) =>
    room?.members.find((m) => m.id === id)?.name ?? id.slice(0, 6);

  return (
    <div className="shell" data-view={view}>
      <nav className="iconrail" aria-label="切换">
        <span className="iconrail-brand"><Mark /></span>
        {([
          ["rooms", "消息", rooms.length],
          ["staff", "员工", staff.length],
          ["settings", "设置", 0],
        ] as const).map(([key, label, n]) => (
          <button key={key} className="navbtn" aria-current={tab === key}
                  onClick={() => setTab(key)} title={label}>
            <span className="navbtn-label">{label}</span>
            {n > 0 && <span className="navbtn-n">{n}</span>}
          </button>
        ))}
        {asks.length > 0 && (
          <button className="navbtn waiting-dot" title={`${asks.length} 件事在等你`}
                  onClick={() => { setTab("rooms"); const a = asks[0];
                                   if (a.conversation_id) open(a.conversation_id); }}>
            <span className="navbtn-label">待办</span>
            <span className="count">{asks.length}</span>
          </button>
        )}
      </nav>

      <aside className="rail">
        <div className="rail-head">
          <h1>{tab === "rooms" ? "消息" : tab === "staff" ? "员工" : "设置"}</h1>
          <span className="where">
            {tab === "rooms" ? `${rooms.length} 个房间` : tab === "staff" ? `${staff.length} 人` : ""}
          </span>
        </div>

        {!online && (
          <div className="offline">
            <span className="dot" data-state="off" />
            连不上后端 —— 它跑在你自己的电脑上
          </div>
        )}

        {(tab === "settings" || !keyState.set) && (
          <NeedKey state={keyState} onSaved={refreshLists}
                   compact={tab !== "settings"}
                   onExpand={() => setTab("settings")} />
        )}

        {tab === "rooms" && <Waiting
          asks={asks}
          onPick={(a) => { if (a.conversation_id) open(a.conversation_id); }}
        />}

        <div className="rail-scroll">
          {tab === "rooms" && <>
          <div className="section">
            <div className="section-head">
              <span className="eyebrow">房间</span>
              <button className="add" aria-expanded={form === "room"}
                      onClick={() => setForm(form === "room" ? null : "room")}>
                + 开房间
              </button>
            </div>
          </div>
          {form === "room" && (
            <RoomForm
              staff={staff}
              onCancel={() => setForm(null)}
              onDone={(id) => { setForm(null); void refreshLists(); open(id); }}
            />
          )}
          {rooms.length > 0 && (
            <>
              {rooms.map((r) => (
                <button
                  key={r.id}
                  className="room"
                  aria-current={r.id === current}
                  data-unread={unreadOf(r)}
                  onClick={() => open(r.id)}
                >
                  <Glyph name={r.title || "群"} />
                  <span className="room-name">{r.title || "未命名房间"}</span>
                  {unreadOf(r) && <span className="room-badge">新</span>}
                  <span className="room-sub">
                    {r.members} 人 · {r.last_text ?? "还没人说话"}
                  </span>
                </button>
              ))}
            </>
          )}

          </>}

          {tab === "staff" && <>
          <div className="section">
            <div className="section-head">
              <span className="eyebrow">员工</span>
              <button className="add" aria-expanded={form === "hire"}
                      onClick={() => setForm(form === "hire" ? null : "hire")}>
                + 招人
              </button>
            </div>
          </div>
          {form === "hire" && (
            <HireForm
              devices={devices}
              onCancel={() => setForm(null)}
              onDone={() => { setForm(null); void refreshLists(); }}
            />
          )}
          {staff.length === 0 && (
            <p style={{ padding: "0 16px", fontSize: "var(--t-xs)", color: "var(--ink-2)" }}>
              还没招人。
            </p>
          )}
          {staff.map((a) => (
            <button key={a.id} className="staff" onClick={() => setSheet(a)}>
              <Glyph name={a.name} id={a.id} />
              <span className="staff-name">{a.name}</span>
              <Presence agent={a} />
              <span className="staff-post">{postOf(a)}</span>
            </button>
          ))}
          </>}
        </div>
      </aside>

      <main className="main">
        {!room ? (
          rooms.length === 0 ? (
            <FirstRun online={online} />
          ) : (
            <div className="empty">
              <h2>挑一个房间</h2>
              <p>左边选一个房间，或者点某个员工单独跟他说。</p>
            </div>
          )
        ) : (
          <>
            <div className="main-head">
              <button className="back" onClick={() => setView("rail")}>← 返回</button>
              <div>
                <h2>{rooms.find((r) => r.id === room.id)?.title || "房间"}</h2>
                <span className="roster">
                  {room.members.map((m) => m.name).join("、")}
                </span>
              </div>
              <button className="add" style={{ marginLeft: "auto" }}
                      aria-expanded={inviting}
                      onClick={() => setInviting(!inviting)}>+ 拉人</button>
            </div>

            {inviting && (
              <div className="form" style={{ margin: "12px 22px" }}>
                <label>
                  把谁拉进这个房间
                  <div className="pickers">
                    {staff.filter((a) => !room.members.some((m) => m.id === a.id))
                          .map((a) => (
                      <button key={a.id} type="button" className="pick"
                              onClick={() => {
                                void api.invite(room.id, a.id)
                                  .then(() => { setInviting(false); void refreshRoom(room.id); });
                              }}>{a.name}</button>
                    ))}
                  </div>
                </label>
                {staff.every((a) => room.members.some((m) => m.id === a.id)) && (
                  <p className="form-note">所有员工都在这个房间里了。</p>
                )}
              </div>
            )}

            <div className="transcript" ref={feed}>
              {(room.has_more || older.length > 0) && (
                <button className="earlier" onClick={() => void loadEarlier()}>
                  加载更早的
                </button>
              )}
              {[...older, ...room.messages].map((m: Message, idx, all) => {
                const prev = all[idx - 1];
                const day = dayOf(m.created_at);
                const newDay = !prev || dayOf(prev.created_at) !== day;
                // 同一个人在 5 分钟内接着说 → 合并，不重复挂名字
                const cont = !newDay && prev?.speaker_id === m.speaker_id
                  && m.speaker_kind !== "system"
                  && new Date(m.created_at).getTime()
                     - new Date(prev.created_at).getTime() < 5 * 60_000;
                const firstNew = mark !== null && m.created_at > mark
                  && (!prev || prev.created_at <= mark);
                return (
                  <div key={m.seq}>
                    {newDay && <div className="daymark">{day}</div>}
                    {firstNew && <div className="newmark">以下是新消息</div>}
                    <div className="line"
                         data-boss={m.speaker_kind === "boss"}
                         data-system={m.speaker_kind === "system"}
                         data-cont={cont}>
                      <span className="line-av">
                        {!cont && m.speaker_kind !== "system" && (
                          <Glyph name={m.speaker_name} id={m.speaker_id}
                                 boss={m.speaker_kind === "boss"} />
                        )}
                      </span>
                      <span className="line-who"
                            style={m.speaker_kind === "agent"
                              ? ({ "--hue": hueOf(m.speaker_id) } as React.CSSProperties)
                              : undefined}>
                        <b>{m.speaker_name}</b>
                        <span className="line-time">{timeOf(m.created_at)}</span>
                      </span>
                      <span className="line-body">
                        {withMentions(m.text, memberNames)}
                        <Steps steps={m.steps ?? []} />
                      </span>
                      <span className="line-acts">
                        <button onClick={() => void navigator.clipboard?.writeText(m.text)}>
                          复制
                        </button>
                        <button onClick={() => quote(m)}>引用</button>
                      </span>
                    </div>
                  </div>
                );
              })}

              {pending.map((text, n) => (
                <div className="line" data-boss="true" data-pending="true" key={`p${n}`}>
                  <span className="line-av"><Glyph name="我" boss /></span>
                  <span className="line-who"><b>我</b></span>
                  <span className="line-body">{text}</span>
                </div>
              ))}

              {roomAsks.length > 0 && (
                <div className="askmark">
                  <Glyph name={roomAsks[0].agent_name} id={roomAsks[0].agent_id} size="sm" />
                  {roomAsks[0].agent_name} 在这里
                  {roomAsks[0].kind === "approval" ? "要动真东西" : "问了你一件事"}
                  {roomAsks.length > 1 && `，另外还有 ${roomAsks.length - 1} 件`}
                  <span className="askmark-go">↓ 在下面等你</span>
                </div>
              )}

              {thinking && (
                <div className="thinking">
                  <span className="dot" data-state="busy" />
                  {nameOf(thinking)} 在想
                </div>
              )}
            </div>

            {roomAsks.length > 0 && (
              /* 一次只处理一件 —— 三件堆在这儿会占掉半屏，而且人本来也是
                 一件一件答的。答完自动推进下一件。 */
              <div className="dock" role="region" aria-label="在等你">
                <div className="dock-head">
                  <span className="dock-title">在等你</span>
                  <span className="dock-hint">答完这一件才会继续</span>
                  {roomAsks.length > 1 && (
                    <span className="dock-rest">还有 {roomAsks.length - 1} 件</span>
                  )}
                </div>
                <div className="dock-body">
                  {roomAsks[0].kind === "approval" ? (
                    <ApprovalAsk key={roomAsks[0].id} ask={roomAsks[0]} onDone={refreshLists} />
                  ) : (
                    <QuestionAsk key={roomAsks[0].id} ask={roomAsks[0]} onDone={refreshLists} />
                  )}
                </div>
              </div>
            )}

            <div className="composer">
              {atHits.length > 0 && (
                <div className="atlist">
                  {atHits.map((m) => (
                    <button key={m.id} className="atitem"
                            onMouseDown={(e) => { e.preventDefault(); completeAt(m.name); }}>
                      <Glyph name={m.name} size="sm" />
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="composer-box">
                <textarea
                  ref={boxRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={1}
                  onKeyDown={(e) => {
                    // 聊天软件的规矩：Enter 发送，Shift+Enter 换行。
                    // 之前只认 ⌘↩ —— 那是文档编辑器的规矩，不是聊天的。
                    // @ 列表开着时，Enter/Tab 补全而不是发送
                    if (atHits.length && (e.key === "Enter" || e.key === "Tab")
                        && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      completeAt(atHits[0].name);
                      return;
                    }
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
                  }}
                  placeholder="交代一件事。背景说清楚，他们不清楚会问你。"
                  aria-label="给房间里的人说话"
                />
                <div className="composer-foot">
                  <p className="hint">↩ 发送 · ⇧↩ 换行 · @名字 指定谁接着说</p>
                  <button className="send" onClick={() => void send()}
                          disabled={sending || !draft.trim()}>
                    {sending ? "发送中" : "发送"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {palette && (
        <Palette
          rooms={rooms}
          staff={staff}
          onClose={() => setPalette(false)}
          onPick={(kind, id) => {
            setPalette(false);
            if (kind === "room") open(id);
            else setSheet(staff.find((a) => a.id === id) ?? null);
          }}
        />
      )}

      {sheet && (
        <>
          <div className="sheet-scrim" onClick={() => setSheet(null)} />
          <div className="sheet" role="dialog" aria-label={`${sheet.name} 的档案`}>
            <div className="sheet-head">
              <Glyph name={sheet.name} id={sheet.id} size="lg" />
              <div>
                <h3>{sheet.name}</h3>
                <Presence agent={sheet} />
              </div>
              <button className="opt" style={{ marginLeft: "auto" }}
                      onClick={() => setSheet(null)}>关闭</button>
            </div>
            <dl>
              <dt>工位</dt>
              <dd>
                {postOf(sheet)}
                {sheet.workstation === "device" && "，你电脑开着时上班"}
              </dd>
              <dt>能动你的文件</dt>
              <dd>{sheet.workstation === "device" ? "能 —— 仅限那台设备上的项目" : "不能"}</dd>
              <dt>记忆存在</dt>
              <dd>{sheet.workstation === "device" ? "你自己的电脑上" : "服务端"}</dd>
              <dt>当前</dt>
              <dd>{sheet.busy > 0 ? `在忙 · ${sheet.busy} 件事` : "空闲"}</dd>
              <dt>员工 id</dt>
              <dd className="mono" style={{ fontSize: "var(--t-xs)" }}>{sheet.id}</dd>
            </dl>
          </div>
        </>
      )}
    </div>
  );
}
