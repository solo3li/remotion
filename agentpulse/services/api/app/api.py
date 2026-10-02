"""HTTP 层。三端读它，人机桥也打回它。

两类端点，边界要清楚：
  /internal/bridge/*  —— 只有本机的 dsh 员工进程会调（人机桥，ADR 0022）。
                         **会长时间阻塞**：员工在等老板回答。
  其余                 —— 三端客户端调（ADR 0021 三端同源）。

P1 单进程、单老板、局域网（ADR 0021），所以没有认证也没有多租户。
上服务器前必须补 —— 见文末 TODO。
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app import secrets as secretstore
from app import store
from app.bus import AskBus, EventBus
from app.rooms import run_discussion

# 桥的等待上限。老板可能半小时后才看手机（与插件侧默认一致，ADR 0022）。
ASK_TIMEOUT_SECONDS = 30 * 60


@dataclass
class Deps:
    conn: sqlite3.Connection
    asks: AskBus
    events: EventBus
    # 注入点：给定 conversation_id 返回房间要的 execute_turn。
    # 由启动方接上真实 dsh（app/runtime/employee_turn.py），测试里换成假的。
    make_executor: Any = None
    # 桥的等待上限。可覆盖，让超时路径能被测到而不用真等半小时。
    ask_timeout: float = ASK_TIMEOUT_SECONDS
    # 前端构建产物目录。桌面壳里由 API 同源伺服；开发/测试时留空。
    web_root: str | None = None
    # 凭证加解密。None 表示这个部署不支持在界面里填 key（只走环境变量）。
    cipher: Any = None


# 请求模型必须定义在**模块级**：本文件开头有 `from __future__ import annotations`，
# 所有注解都是字符串，而 FastAPI 用模块全局命名空间解析它们。定义在 create_app
# 内部的话解析不到，FastAPI 会把 body 当成 query 参数，返回 422。
# （这个坑是测试抓出来的，别把它们搬回函数里。）

class BridgeAsk(BaseModel):
    session_id: str | None = None
    questions: list[dict]
    conversation_id: str | None = None
    agent_id: str | None = None


class BridgeApprove(BaseModel):
    session_id: str | None = None
    tool_name: str
    call_id: str | None = None
    reason: str | None = None
    conversation_id: str | None = None
    agent_id: str | None = None


class Answer(BaseModel):
    # question: {"answers":[{"id","selected":[...]}]}
    # approval: {"decision":"approve"|"reject"|"cancel"}
    answers: list[dict] | None = None
    decision: str | None = None


class Say(BaseModel):
    text: str = Field(min_length=1)
    max_turns: int = 6


class Hire(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    persona: str = Field(min_length=1)
    workstation: Literal["cloud", "device"]
    device_id: str | None = None


class OpenRoom(BaseModel):
    title: str = Field(default="", max_length=80)
    agent_ids: list[str] = Field(default_factory=list)


class Invite(BaseModel):
    # 员工调工具拉人时只知道名字，不知道 uuid —— 两种都收
    agent_id: str | None = None
    agent_name: str | None = None
    invited_by: str | None = None
    reason: str | None = None


class ModelKey(BaseModel):
    """老板填的模型 key。只进不出 —— 没有任何接口能把它读回来。"""
    key: str = Field(min_length=8, max_length=400)
    base_url: str | None = None


def create_app(deps: Deps) -> FastAPI:
    d_ = deps
    # 在飞的后台讨论。必须记着它们 —— 不然优雅关闭会永远等一个可能正阻塞在
    # 30 分钟桥等待上的任务，进程停不下来、端口不放，重启直接挂死。
    # （这是真跑起来才发现的：日志停在 "Waiting for background tasks to
    #   complete"，而旧进程占着端口，新进程起不来。）
    live: set[asyncio.Task] = set()
    # 每个房间同一时刻只跑一场讨论。允许并发的后果实测过：员工互相盖话，
    # 老板收到几组几乎一样的提问，回答也重复落进 transcript。
    running: dict[str, asyncio.Task] = {}

    @contextlib.asynccontextmanager
    async def lifespan(_app: FastAPI):
        # 启动时把遗留的 pending ask 全部标 expired。
        # AskBus 是进程内的，所以重启后**没有任何**桥还在等这些答案 —— 留着
        # 它们只会让老板对着空气回答，而且真正在等的员工那轮早就死了。
        orphans = d_.conn.execute(
            "UPDATE asks SET status='expired' WHERE status='pending'").rowcount
        if orphans:
            logging.getLogger("agentpulse").info(
                "expired %d orphaned ask(s) left by a previous run", orphans)
        yield
        # 顺序要紧，反了会死锁：
        # 1) 先唤醒所有在等的桥请求。员工那轮阻塞在 `asyncio.to_thread` 里，
        #    而 to_thread **不可取消** —— 只有让桥的 HTTP 返回，dsh 那一轮才
        #    会走完、线程才会释放。（第一版把这步放在 gather 之后，退出 app
        #    时后端和 dsh 子进程双双留活，就是这个原因。）
        deps.asks.cancel_all("API 正在关闭")
        for task in list(live):
            task.cancel()
        if live:
            # 再加个上限：万一还有拿不回来的线程，也不能让进程停不下来。
            with contextlib.suppress(TimeoutError, asyncio.TimeoutError):
                await asyncio.wait_for(
                    asyncio.gather(*live, return_exceptions=True), timeout=8)

    app = FastAPI(title="AgentPulse", lifespan=lifespan)
    app.state.deps = deps

    def get_deps() -> Deps:
        return app.state.deps

    # ── 人机桥：员工问人 ────────────────────────────────────────────────
    # 这两个端点会阻塞到老板回答。这不是设计缺陷 —— 员工确实在等人。

    @app.post("/internal/bridge/ask")
    async def bridge_ask(body: BridgeAsk, d: Deps = Depends(get_deps)):
        agent_id = body.agent_id or _agent_by_session(d.conn, body.session_id)
        ask_id = store.record_ask(d.conn, agent_id, "question",
                                  {"questions": body.questions},
                                  conversation_id=body.conversation_id)
        d.events.publish({"type": "ask", "ask_id": ask_id, "kind": "question",
                          "agent_id": agent_id,
                          "conversation_id": body.conversation_id})
        try:
            return await d.asks.wait(ask_id, timeout=d.ask_timeout)
        except (TimeoutError, asyncio.TimeoutError):
            d.conn.execute("UPDATE asks SET status='expired' WHERE id=? AND status='pending'",
                           (ask_id,))
            d.events.publish({"type": "ask_expired", "ask_id": ask_id})
            # 桥收到非 2xx 会 fail-closed，正是我们要的
            raise HTTPException(504, "the boss did not answer in time") from None

    @app.post("/internal/bridge/approve")
    async def bridge_approve(body: BridgeApprove, d: Deps = Depends(get_deps)):
        agent_id = body.agent_id or _agent_by_session(d.conn, body.session_id)
        ask_id = store.record_ask(
            d.conn, agent_id, "approval",
            {"tool_name": body.tool_name, "call_id": body.call_id, "reason": body.reason},
            conversation_id=body.conversation_id)
        d.events.publish({"type": "ask", "ask_id": ask_id, "kind": "approval",
                          "agent_id": agent_id, "tool_name": body.tool_name,
                          "conversation_id": body.conversation_id})
        try:
            return await d.asks.wait(ask_id, timeout=d.ask_timeout)
        except (TimeoutError, asyncio.TimeoutError):
            d.conn.execute("UPDATE asks SET status='expired' WHERE id=? AND status='pending'",
                           (ask_id,))
            d.events.publish({"type": "ask_expired", "ask_id": ask_id})
            raise HTTPException(504, "the boss did not answer in time") from None

    # ── 三端：等老板拍板的事 ────────────────────────────────────────────

    @app.get("/asks")
    def list_asks(d: Deps = Depends(get_deps)):
        return {"asks": [
            {"id": a["id"], "kind": a["kind"], "agent_name": a["agent_name"],
             "agent_id": a["agent_id"], "conversation_id": a["conversation_id"],
             "payload": a["payload"], "created_at": a["created_at"]}
            for a in store.pending_asks(d.conn)]}

    @app.post("/asks/{ask_id}/answer")
    def answer(ask_id: str, body: Answer, d: Deps = Depends(get_deps)):
        payload = {k: v for k, v in body.model_dump().items() if v is not None}
        if not payload:
            raise HTTPException(400, "answer needs either answers[] or decision")
        row = d.conn.execute(
            "SELECT conversation_id, kind FROM asks WHERE id = ?", (ask_id,)).fetchone()
        # 落库先于唤醒：先持久化，才不会出现"桥拿到答案但库里没记"
        if not store.answer_ask(d.conn, ask_id, payload):
            raise HTTPException(409, "this ask was already answered or is gone")

        # 回答本身就是老板在群里说的一句话（ADR 0020：问答和拍板是消息）。
        # 不落成消息的话，卡片一消失老板就不知道自己刚答了什么，决策也不进记录。
        if row is not None and row["conversation_id"]:
            said = _phrase_answer(row["kind"], payload)
            boss = _the_boss(d.conn, row["conversation_id"])
            store.say(d.conn, row["conversation_id"], "boss", boss, said)
            d.events.publish({"type": "message", "conversation_id": row["conversation_id"],
                              "speaker_id": boss, "text": said})

        waiting = d.asks.resolve(ask_id, payload)
        d.events.publish({"type": "ask_answered", "ask_id": ask_id})
        # waiting=False 不是错：可能 API 重启过，桥那边的连接早断了
        return {"ok": True, "delivered_to_employee": waiting}

    # ── 三端：房间 ──────────────────────────────────────────────────────

    @app.get("/rooms")
    def rooms(d: Deps = Depends(get_deps)):
        rows = d.conn.execute(
            "SELECT c.id, c.title, c.created_at, c.archived_at, "
            "  (SELECT COUNT(*) FROM conversation_members m "
            "   WHERE m.conversation_id = c.id AND m.left_at IS NULL) AS members, "
            "  (SELECT text FROM messages x WHERE x.conversation_id = c.id "
            "   ORDER BY seq DESC LIMIT 1) AS last_text "
            "FROM conversations c WHERE c.archived_at IS NULL "
            "ORDER BY c.created_at DESC").fetchall()
        return {"rooms": [dict(r) for r in rows]}

    @app.get("/search")
    def search(q: str = "", d: Deps = Depends(get_deps)):
        """搜消息。工作聊天软件没有搜索，历史一多就等于没有。"""
        hits = store.search_messages(d.conn, q)
        return {"hits": [
            {"conversation_id": h["conversation_id"], "title": h["title"],
             "speaker_name": h["speaker_name"], "text": h["text"],
             "seq": h["seq"], "created_at": h["created_at"]}
            for h in hits]}

    @app.get("/rooms/{room_id}")
    def room(room_id: str, before: int | None = None, limit: int = 80,
             d: Deps = Depends(get_deps)):
        members = store.load_members(d.conn, room_id)
        if not members and not _room_exists(d.conn, room_id):
            raise HTTPException(404, "no such room")
        rows, has_more = store.load_page(d.conn, room_id, before=before,
                                         limit=max(1, min(limit, 300)))
        names = {m.id: m.name for m in members}
        return {
            "id": room_id,
            "has_more": has_more,
            "members": [{"id": m.id, "name": m.name, "is_boss": m.is_boss}
                        for m in members],
            "messages": [
                {k: v for k, v in r.items() if k != "steps_json"}
                | {"speaker_name": names.get(r["speaker_id"], r["speaker_id"]),
                   "steps": json.loads(r["steps_json"]) if r["steps_json"] else []}
                for r in rows
            ],
        }

    @app.post("/rooms/{room_id}/say")
    async def say(room_id: str, body: Say, d: Deps = Depends(get_deps)):
        """老板说一句，然后员工们接着讨论。

        立刻返回 —— 讨论在后台跑，进展经 /events 推给三端。让 HTTP 请求挂着
        等一屋子员工聊完是几分钟，任何客户端都会先超时。
        """
        boss = _the_boss(d.conn, room_id)
        store.say(d.conn, room_id, "boss", boss, body.text)
        d.events.publish({"type": "message", "conversation_id": room_id,
                          "speaker_id": boss, "text": body.text})
        if d.make_executor is None:
            return {"ok": True, "discussing": False}
        if room_id in running and not running[room_id].done():
            # 已经在聊了 —— 这句话进了 transcript，下一轮发言自然会看到它。
            # 再起一场只会让员工互相盖话。
            return {"ok": True, "discussing": True, "joined_running": True}
        task = asyncio.create_task(_discuss(d, room_id, body.max_turns))
        running[room_id] = task
        live.add(task)
        task.add_done_callback(live.discard)
        task.add_done_callback(lambda _t, r=room_id: running.pop(r, None)
                               if running.get(r) is _t else None)
        return {"ok": True, "discussing": True}

    # ── 模型凭证 ────────────────────────────────────────────────────────
    # 打包后的 app 从 Finder 启动，拿不到 shell 的环境变量 —— 所以界面上
    # 必须能填，否则员工集体沉默而且没有任何解释。

    @app.get("/settings/model-key")
    def read_key(d: Deps = Depends(get_deps)):
        """只说有没有、末四位是什么。**明文永不返回。**"""
        if d.cipher is None:
            return {"supported": False, "set": False}
        info = secretstore.describe(d.conn, scope="workspace",
                                    scope_id=_the_workspace(d.conn))
        return {"supported": True, "set": info is not None, **(info or {})}

    @app.put("/settings/model-key")
    def write_key(body: ModelKey, d: Deps = Depends(get_deps)):
        if d.cipher is None:
            raise HTTPException(400, "这个部署不支持在界面里填 key")
        secretstore.put_key(d.conn, d.cipher, scope="workspace",
                            scope_id=_the_workspace(d.conn),
                            plaintext=body.key, base_url=body.base_url)
        d.events.publish({"type": "model_key_changed"})
        return {"ok": True}

    @app.delete("/settings/model-key")
    def clear_key(d: Deps = Depends(get_deps)):
        if d.cipher is None:
            raise HTTPException(400, "这个部署不支持在界面里填 key")
        secretstore.drop_key(d.conn, scope="workspace",
                             scope_id=_the_workspace(d.conn))
        d.events.publish({"type": "model_key_changed"})
        return {"ok": True}

    @app.get("/devices")
    def devices(d: Deps = Depends(get_deps)):
        rows = d.conn.execute(
            "SELECT id, name, platform, last_seen_at FROM devices ORDER BY created_at"
        ).fetchall()
        return {"devices": [dict(r) for r in rows]}

    @app.post("/agents")
    def hire(body: Hire, d: Deps = Depends(get_deps)):
        """招一个员工。工位在这里定死，之后 schema 的 trigger 不许改（ADR 0021）。"""
        ws = _the_workspace(d.conn)
        if body.workstation == "device" and not body.device_id:
            raise HTTPException(400, "本机员工必须选一台设备")
        try:
            agent_id = store.hire(d.conn, ws, body.name.strip(), body.persona.strip(),
                                  workstation=body.workstation, device_id=body.device_id)
        except sqlite3.IntegrityError as exc:
            raise HTTPException(400, f"招不进来：{exc}") from exc
        d.events.publish({"type": "hired", "agent_id": agent_id})
        return {"id": agent_id}

    @app.post("/rooms")
    def open_room(body: OpenRoom, d: Deps = Depends(get_deps)):
        """开个房间。老板自动在里面 —— 房间是他和员工的地方。"""
        ws = _the_workspace(d.conn)
        boss = _the_only_boss(d.conn)
        room_id = store.open_room(d.conn, ws, body.title.strip())
        store.invite(d.conn, room_id, "boss", boss)
        for aid in body.agent_ids:
            store.invite(d.conn, room_id, "agent", aid)
        d.events.publish({"type": "room_opened", "conversation_id": room_id})
        return {"id": room_id}

    @app.post("/rooms/{room_id}/invite")
    def invite(room_id: str, body: Invite, d: Deps = Depends(get_deps)):
        """拉人进群。员工也能拉人，但必须留下是谁拉的、为什么（ADR 0023）。"""
        if not _room_exists(d.conn, room_id):
            raise HTTPException(404, "no such room")
        agent_id = body.agent_id or _agent_by_name(d.conn, body.agent_name)
        if agent_id is None:
            # 报错要带上可选名单 —— 员工才知道下一步该叫谁
            names = [r["name"] for r in d.conn.execute(
                "SELECT name FROM agents ORDER BY created_at").fetchall()]
            raise HTTPException(404, f"公司里没有「{body.agent_name}」。现有：{'、'.join(names)}")
        already = {m.id for m in store.load_members(d.conn, room_id)}
        if agent_id in already:
            return {"ok": True, "already_in": True}
        store.invite(d.conn, room_id, "agent", agent_id,
                     invited_by=body.invited_by, reason=body.reason)
        who = store.get_agent(d.conn, agent_id)["name"]
        by = (store.get_agent(d.conn, body.invited_by)["name"]
              if body.invited_by else "老板")
        # 拉人是群里可见的事件，不是静默的（ADR 0023）
        note = f"{by} 把 {who} 拉进来了" + (f"：{body.reason}" if body.reason else "")
        store.say(d.conn, room_id, "system", "system", note)
        d.events.publish({"type": "message", "conversation_id": room_id,
                          "speaker_id": "system", "text": note})
        return {"ok": True}

    @app.get("/agents")
    def agents(d: Deps = Depends(get_deps)):
        rows = d.conn.execute(
            "SELECT a.id, a.name, a.workstation, a.device_id, d.name AS device_name, "
            "  (SELECT COUNT(*) FROM runs r WHERE r.agent_id = a.id "
            "   AND r.status IN ('running','waiting_boss')) AS busy "
            "FROM agents a LEFT JOIN devices d ON d.id = a.device_id "
            "ORDER BY a.created_at").fetchall()
        return {"agents": [dict(r) for r in rows]}

    # ── 三端：实时推送 ──────────────────────────────────────────────────

    @app.get("/events")
    async def events(d: Deps = Depends(get_deps)):
        async def stream():
            # 不用 request.is_disconnected() 判断退出：它会 await ASGI 的
            # receive()，而客户端不主动发 http.disconnect 时它永久阻塞，一个
            # 字节都出不来。客户端断开时 Starlette 会取消这个生成器，
            # `async with` 的 finally 自己退订 —— 那才是可靠的退出路径。
            async with d.events.subscribe() as q:
                yield "retry: 2000\n\n"          # 断线让客户端 2s 后重连
                while True:
                    try:
                        event = await asyncio.wait_for(q.get(), timeout=15)
                    except (TimeoutError, asyncio.TimeoutError):
                        yield ": keepalive\n\n"   # 别让代理掐掉空闲连接
                        continue
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

        return StreamingResponse(stream(), media_type="text/event-stream",
                                 headers={"cache-control": "no-cache",
                                          "x-accel-buffering": "no"})

    @app.get("/health")
    def health(d: Deps = Depends(get_deps)):
        return {"ok": True, "subscribers": d.events.subscriber_count}

    # 桌面壳里前端由这里伺服 —— 同源，所以前端不需要 proxy 也不需要 CORS。
    # 目录不存在就不挂（开发时前端在 vite 上跑，测试也不受影响）。
    if deps.web_root and Path(deps.web_root).is_dir():
        app.mount("/app", StaticFiles(directory=deps.web_root, html=True), name="app")

    return app


# ── 后台讨论 ────────────────────────────────────────────────────────────

async def _discuss(d: Deps, room_id: str, max_turns: int) -> None:
    """把房间推进到停下来，每条发言落库 + 推送。

    异常必须吞在这里：这是个 fire-and-forget task，抛出去只会变成一条没人看的
    "Task exception was never retrieved"，而老板会以为员工在思考。
    """
    try:
        transcript = store.load_transcript(d.conn, room_id)
        members = store.load_members(d.conn, room_id)
        execute = d.make_executor(room_id)
        async for ev in run_discussion(transcript, members,
                                       execute_turn=execute, max_turns=max_turns):
            if ev.type == "utterance":
                store.say(d.conn, room_id, "agent", ev.payload["agent_id"],
                          ev.payload["text"], steps=ev.payload.get("steps") or None)
            d.events.publish({**ev.payload, "type": ev.type,
                              "conversation_id": room_id})
    except asyncio.CancelledError:
        raise            # 关闭时被取消，不是错误，别当 error 报给老板
    except Exception as exc:  # noqa: BLE001 - 见上
        logging.getLogger("agentpulse").exception("discussion failed in %s", room_id)
        d.events.publish({"type": "error", "conversation_id": room_id,
                          "detail": f"{type(exc).__name__}: {exc}"})


# ── 小工具 ──────────────────────────────────────────────────────────────

def _agent_by_session(conn: sqlite3.Connection, session_id: str | None) -> str:
    """桥只知道 dsh 的 session id，得换成员工 id。"""
    if session_id:
        row = conn.execute("SELECT id FROM agents WHERE session_id = ?",
                           (session_id,)).fetchone()
        if row is not None:
            return row["id"]
    raise HTTPException(400, "cannot map this run to an employee; pass agent_id")


def _phrase_answer(kind: str, payload: dict) -> str:
    """把老板的回答写成一句人话，落进 transcript。"""
    if kind == "approval":
        return {"approve": "批准了这一次。",
                "reject": "这个不行。",
                "cancel": "先撤了。"}.get(payload.get("decision", ""), "已处理。")
    # 每个问题一行 —— 多问一起答时挤成一行读不出哪个答的是哪个。
    # 同时去掉选项标签里的推荐标记：那是给老板看的提示，不是老板说的话。
    import re
    lines = []
    for item in payload.get("answers") or []:
        picks = [re.sub(r"[（(](?:推荐|Recommended)[)）]\s*$", "", c).strip()
                 for c in (item.get("selected") or [])]
        said = "、".join(p for p in picks if p) or (item.get("custom") or "").strip()
        if said:
            lines.append(said)
    return "\n".join(lines) if lines else "已回复。"


def _room_exists(conn: sqlite3.Connection, room_id: str) -> bool:
    return conn.execute("SELECT 1 FROM conversations WHERE id = ?",
                        (room_id,)).fetchone() is not None


def _agent_by_name(conn: sqlite3.Connection, name: str | None) -> str | None:
    if not name:
        return None
    row = conn.execute("SELECT id FROM agents WHERE name = ?", (name.strip(),)).fetchone()
    return row["id"] if row else None


def _the_workspace(conn: sqlite3.Connection) -> str:
    row = conn.execute("SELECT id FROM workspaces ORDER BY created_at LIMIT 1").fetchone()
    if row is None:
        raise HTTPException(400, "还没有公司")
    return row["id"]


def _the_only_boss(conn: sqlite3.Connection) -> str:
    # P1 单老板（ADR 0021）。多租户是 P3 的事，那时这个函数会消失。
    row = conn.execute("SELECT id FROM users ORDER BY created_at LIMIT 1").fetchone()
    if row is None:
        raise HTTPException(400, "还没有老板")
    return row["id"]


def _the_boss(conn: sqlite3.Connection, room_id: str) -> str:
    for m in store.load_members(conn, room_id):
        if m.is_boss:
            return m.id
    raise HTTPException(400, "this room has no boss in it")


# TODO(P3, 上服务器前必须做): 认证与多租户隔离。P1 是单进程单老板局域网
# （ADR 0021），/internal/bridge/* 也只有本机 dsh 进程会调。一旦不是这个部署
# 形态，这两条假设同时失效。
