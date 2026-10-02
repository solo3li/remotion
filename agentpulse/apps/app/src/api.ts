// 后端契约。对应 services/api/app/api.py —— 改那边记得改这里。

export type Presence = "on" | "busy" | "off";

export interface Agent {
  id: string;
  name: string;
  workstation: "cloud" | "device";
  device_id: string | null;
  device_name: string | null;
  busy: number;
}

export interface RoomSummary {
  id: string;
  title: string;
  created_at: string;
  archived_at: string | null;
  members: number;
  last_text: string | null;
}

export interface Step {
  kind: "tool" | "ask";
  label: string;
  detail?: string;
}

export interface Message {
  speaker_kind: "boss" | "agent" | "system";
  speaker_id: string;
  speaker_name: string;
  text: string;
  steps: Step[];
  created_at: string;
  seq: number;
}

export interface Member {
  id: string;
  name: string;
  is_boss: boolean;
}

export interface RoomDetail {
  id: string;
  has_more: boolean;
  members: Member[];
  messages: Message[];
}

export interface Hit {
  conversation_id: string;
  title: string;
  speaker_name: string;
  text: string;
  seq: number;
  created_at: string;
}

export interface AskOption {
  label: string;
  description?: string;
}

export interface AskQuestion {
  id: string;
  question: string;
  detail?: string;
  header?: string;
  options?: AskOption[];
  multiSelect?: boolean;
  // dsh 原生 intent：plan-review 时 approve 指向"批准"那个选项的 label
  intent?: { kind: "plan-review"; approve: string };
}

export interface Ask {
  id: string;
  kind: "question" | "approval";
  agent_id: string;
  agent_name: string;
  conversation_id: string | null;
  created_at: string;
  payload: {
    questions?: AskQuestion[];
    tool_name?: string;
    call_id?: string | null;
    reason?: string | null;
  };
}

// 三种部署形态：
//   dev      —— vite proxy 转到 127.0.0.1:8787，用 "/api"
//   桌面壳    —— FastAPI 同源伺服前端，用 ""（VITE_API_BASE= 构建）
//   局域网手机 —— 直连 Mac 的地址
const BASE = import.meta.env.VITE_API_BASE ?? "/api";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  if (!res.ok) {
    // 把后端的 detail 带出来。"请求失败"对谁都没用。
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch { /* 非 JSON 就用 statusText */ }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export interface Device {
  id: string;
  name: string;
  platform: "macos" | "windows" | "linux";
  last_seen_at: string | null;
}

export interface ModelKeyState {
  supported: boolean;
  set: boolean;
  tail?: string;
  base_url?: string | null;
  updated_at?: string;
}

export const api = {
  // 模型 key：只能写、只能删、读回来只有末四位。明文不经任何 GET。
  modelKey: () => call<ModelKeyState>("/settings/model-key"),
  setModelKey: (key: string, base_url?: string) =>
    call<{ ok: true }>("/settings/model-key", {
      method: "PUT", body: JSON.stringify({ key, base_url: base_url || null }),
    }),
  clearModelKey: () => call<{ ok: true }>("/settings/model-key", { method: "DELETE" }),

  devices: () => call<{ devices: Device[] }>("/devices"),

  hire: (body: {
    name: string; persona: string;
    workstation: "cloud" | "device"; device_id?: string | null;
  }) => call<{ id: string }>("/agents", { method: "POST", body: JSON.stringify(body) }),

  openRoom: (title: string, agent_ids: string[]) =>
    call<{ id: string }>("/rooms", {
      method: "POST",
      body: JSON.stringify({ title, agent_ids }),
    }),

  invite: (roomId: string, agent_id: string, reason?: string) =>
    call<{ ok: true; already_in?: boolean }>(`/rooms/${roomId}/invite`, {
      method: "POST",
      body: JSON.stringify({ agent_id, reason }),
    }),

  rooms: () => call<{ rooms: RoomSummary[] }>("/rooms"),
  room: (id: string, before?: number) =>
    call<RoomDetail>(`/rooms/${id}${before ? `?before=${before}` : ""}`),
  search: (q: string) => call<{ hits: Hit[] }>(`/search?q=${encodeURIComponent(q)}`),
  agents: () => call<{ agents: Agent[] }>("/agents"),
  asks: () => call<{ asks: Ask[] }>("/asks"),

  say: (id: string, text: string) =>
    call<{ ok: true }>(`/rooms/${id}/say`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  answerQuestion: (askId: string, answers: { id: string; selected: string[] }[]) =>
    call<{ ok: true }>(`/asks/${askId}/answer`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),

  decide: (askId: string, decision: "approve" | "reject") =>
    call<{ ok: true }>(`/asks/${askId}/answer`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),
};

/** SSE。断线自动重连（服务端发了 retry: 2000）。 */
export function subscribe(
  onEvent: (e: Record<string, unknown>) => void,
  onStatus: (online: boolean) => void,
): () => void {
  const src = new EventSource(`${BASE}/events`);
  src.onopen = () => onStatus(true);
  src.onerror = () => onStatus(false);
  src.onmessage = (ev) => {
    try {
      onEvent(JSON.parse(ev.data));
    } catch {
      /* 坏帧就丢，不要让一条脏数据把流搞死 */
    }
  };
  return () => src.close();
}

/** 员工的在场状态。本机员工在你电脑开着时上班，云员工 7×24（ADR 0021）。 */
export function presenceOf(a: Agent): { state: Presence; label: string } {
  // 标签保持短 —— 工位/设备信息在员工行的第二行讲，这里说一遍就够
  if (a.busy > 0) return { state: "busy", label: "在忙" };
  return { state: "on", label: "在岗" };
}

/** 工位一句话。抽屉和员工行共用，避免两处写法漂移。 */
export function postOf(a: Agent): string {
  return a.workstation === "cloud"
    ? "云员工 · 7×24 不下班"
    : `本机员工 · ${a.device_name ?? "未知设备"}`;
}

/** 日期分隔用的标签。聊天里没有这个，一屏消息就分不出哪天的。 */
export function dayOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
  if (same(d, today)) return "今天";
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (same(d, yest)) return "昨天";
  return d.toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
}

/** 每个人一个稳定的名字颜色。多人群里全灰的名字扫不出谁是谁。
    只染名字，不染背景 —— DESIGN.md 的策略是 Restrained。 */
export function hueOf(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  // 避开主色（250）和 signal（68-78）附近，别和状态色抢读
  const banned = (x: number) => Math.abs(x - 250) < 22 || (x > 50 && x < 95);
  let hue = h;
  for (let i = 0; i < 360 && banned(hue); i++) hue = (hue + 17) % 360;
  return hue;
}

export function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}
