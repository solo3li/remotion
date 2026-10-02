"""公司事实的读写。薄 SQL，没有 ORM。

房间（`app/rooms.py`）不认识这个模块 —— 它只吃注入进去的 transcript / members。
这里提供的是把房间接到真实会话上的那几个函数。
"""

from __future__ import annotations

import json
import sqlite3

from app.db import new_id, now, tx
from app.rooms import Member, Utterance


# ── 公司 ────────────────────────────────────────────────────────────────

def create_workspace(conn: sqlite3.Connection, name: str) -> str:
    wid = new_id()
    conn.execute("INSERT INTO workspaces (id, name, created_at) VALUES (?,?,?)",
                 (wid, name, now()))
    return wid


def create_user(conn: sqlite3.Connection, workspace_id: str, name: str) -> str:
    uid = new_id()
    conn.execute("INSERT INTO users (id, workspace_id, name, created_at) VALUES (?,?,?,?)",
                 (uid, workspace_id, name, now()))
    return uid


def register_device(conn: sqlite3.Connection, workspace_id: str, name: str,
                    platform: str) -> str:
    did = new_id()
    conn.execute(
        "INSERT INTO devices (id, workspace_id, name, platform, last_seen_at, created_at) "
        "VALUES (?,?,?,?,?,?)", (did, workspace_id, name, platform, now(), now()))
    return did


def hire(conn: sqlite3.Connection, workspace_id: str, name: str, persona: str, *,
         workstation: str, device_id: str | None = None,
         session_root: str | None = None) -> str:
    """招一个员工。工位在这里定，之后 trigger 不许改（ADR 0021）。"""
    aid = new_id()
    conn.execute(
        "INSERT INTO agents (id, workspace_id, name, persona, workstation, device_id, "
        "session_root, created_at) VALUES (?,?,?,?,?,?,?,?)",
        (aid, workspace_id, name, persona, workstation, device_id, session_root, now()))
    return aid


def get_agent(conn: sqlite3.Connection, agent_id: str) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
    if row is None:
        raise KeyError(f"no such agent: {agent_id}")
    return row


def remember_session(conn: sqlite3.Connection, agent_id: str, session_id: str) -> None:
    """记住员工最近一次 dsh session —— 下一轮续跑它，上下文才连续。"""
    conn.execute("UPDATE agents SET session_id = ? WHERE id = ?", (session_id, agent_id))


# ── 房间 ────────────────────────────────────────────────────────────────

def open_room(conn: sqlite3.Connection, workspace_id: str, title: str = "") -> str:
    cid = new_id()
    conn.execute("INSERT INTO conversations (id, workspace_id, title, created_at) "
                 "VALUES (?,?,?,?)", (cid, workspace_id, title, now()))
    return cid


def invite(conn: sqlite3.Connection, conversation_id: str, member_kind: str,
           member_id: str, *, invited_by: str | None = None,
           reason: str | None = None) -> None:
    """拉人进群。员工也能拉人，但必须留下是谁拉的、为什么（ADR 0023）。"""
    # 用 ON CONFLICT 而不是 INSERT OR REPLACE：后者是删了重插，会分配新 rowid，
    # 把这个人挪到成员队尾 —— 重新邀请一个已在群里的人不该改变发言顺序。
    conn.execute(
        "INSERT INTO conversation_members "
        "(conversation_id, member_kind, member_id, invited_by, invited_reason, joined_at) "
        "VALUES (?,?,?,?,?,?) "
        "ON CONFLICT(conversation_id, member_kind, member_id) DO UPDATE SET "
        "  left_at = NULL, invited_by = excluded.invited_by, "
        "  invited_reason = excluded.invited_reason",
        (conversation_id, member_kind, member_id, invited_by, reason, now()))


def load_members(conn: sqlite3.Connection, conversation_id: str) -> list[Member]:
    """房间要的成员表。已离开的不算。

    按 rowid（插入顺序）排，**不是** joined_at —— 后者只到秒级，同一秒进群的人
    会并列，实际顺序落到随机 uuid 上。那会让 round-robin 选出的第一发言人在
    同一个房间的两次运行里不一样。发言顺序必须是确定的。
    """
    rows = conn.execute(
        "SELECT m.member_kind, m.member_id, "
        "       COALESCE(a.name, u.name, m.member_id) AS name "
        "FROM conversation_members m "
        "LEFT JOIN agents a ON a.id = m.member_id AND m.member_kind = 'agent' "
        "LEFT JOIN users  u ON u.id = m.member_id AND m.member_kind = 'boss' "
        "WHERE m.conversation_id = ? AND m.left_at IS NULL "
        "ORDER BY m.rowid", (conversation_id,)).fetchall()
    return [Member(id=r["member_id"], name=r["name"], is_boss=r["member_kind"] == "boss")
            for r in rows]


def say(conn: sqlite3.Connection, conversation_id: str, speaker_kind: str,
        speaker_id: str, text: str, *, run_id: str | None = None,
        steps: list[dict] | None = None) -> str:
    """追加一条发言。seq 在事务里取，保证 transcript 顺序稳定。"""
    with tx(conn):
        seq = conn.execute(
            "SELECT COALESCE(MAX(seq), 0) + 1 FROM messages WHERE conversation_id = ?",
            (conversation_id,)).fetchone()[0]
        mid = new_id()
        conn.execute(
            "INSERT INTO messages (id, conversation_id, speaker_kind, speaker_id, text, "
            "run_id, steps_json, created_at, seq) VALUES (?,?,?,?,?,?,?,?,?)",
            (mid, conversation_id, speaker_kind, speaker_id, text, run_id,
             json.dumps(steps, ensure_ascii=False) if steps else None, now(), seq))
    return mid


def load_transcript(conn: sqlite3.Connection, conversation_id: str) -> list[Utterance]:
    rows = conn.execute(
        "SELECT speaker_id, text FROM messages WHERE conversation_id = ? ORDER BY seq",
        (conversation_id,)).fetchall()
    return [Utterance(speaker_id=r["speaker_id"], text=r["text"]) for r in rows]


# ── 等老板拍板的事（人机桥落库，ADR 0022）────────────────────────────────

def record_ask(conn: sqlite3.Connection, agent_id: str, kind: str, payload: dict, *,
               conversation_id: str | None = None) -> str:
    """桥打上来的问题落库。落库了才能重启后还看得到、才能在手机上回答。"""
    aid = new_id()
    conn.execute(
        "INSERT INTO asks (id, conversation_id, agent_id, kind, payload_json, created_at) "
        "VALUES (?,?,?,?,?,?)",
        (aid, conversation_id, agent_id, kind, json.dumps(payload, ensure_ascii=False), now()))
    return aid


def answer_ask(conn: sqlite3.Connection, ask_id: str, answer: dict) -> bool:
    """老板回答。只有 pending 的能被回答 —— 防重复提交把已决的事改掉。"""
    cur = conn.execute(
        "UPDATE asks SET status = 'answered', answer_json = ?, answered_at = ? "
        "WHERE id = ? AND status = 'pending'",
        (json.dumps(answer, ensure_ascii=False), now(), ask_id))
    return cur.rowcount == 1


def pending_asks(conn: sqlite3.Connection) -> list[dict]:
    """所有在等老板的事。三端都读这个。"""
    rows = conn.execute(
        "SELECT a.*, ag.name AS agent_name FROM asks a "
        "JOIN agents ag ON ag.id = a.agent_id "
        "WHERE a.status = 'pending' ORDER BY a.created_at").fetchall()
    return [{**dict(r), "payload": json.loads(r["payload_json"])} for r in rows]


# ── 资源租约（ADR 0021）─────────────────────────────────────────────────

class LeaseTaken(RuntimeError):
    """已经有人独占着这个资源。"""


def acquire_lease(conn: sqlite3.Connection, workspace_id: str, resource_type: str,
                  resource_key: str, *, agent_id: str, expires_at: str,
                  mode: str = "exclusive") -> str:
    """拿一个资源租约。独占冲突由唯一索引挡，不靠应用层自觉。"""
    lid = new_id()
    try:
        conn.execute(
            "INSERT INTO resource_leases (id, workspace_id, resource_type, resource_key, "
            "mode, agent_id, expires_at, created_at) VALUES (?,?,?,?,?,?,?,?)",
            (lid, workspace_id, resource_type, resource_key, mode, agent_id,
             expires_at, now()))
    except sqlite3.IntegrityError as exc:
        raise LeaseTaken(f"{resource_type}:{resource_key} is already held") from exc
    return lid


def release_lease(conn: sqlite3.Connection, lease_id: str) -> None:
    conn.execute("UPDATE resource_leases SET released_at = ? WHERE id = ? "
                 "AND released_at IS NULL", (now(), lease_id))


# ── 首次运行自举 ────────────────────────────────────────────────────────

def bootstrap(conn: sqlite3.Connection, *, device_name: str, platform: str) -> dict:
    """空库时建出公司、老板和这台设备。

    没有这一步，打包好的 app 首次启动是死路：空状态叫你「先招一个员工」，
    而招人会返回「还没有公司」。开箱即用意味着开箱那一刻就有一家公司。

    幂等 —— 已经有公司就什么都不做。
    """
    row = conn.execute("SELECT id FROM workspaces LIMIT 1").fetchone()
    if row is not None:
        return {"created": False, "workspace_id": row["id"]}

    with tx(conn):
        ws = create_workspace(conn, "我的公司")
        boss = create_user(conn, ws, "老板")
        device = register_device(conn, ws, device_name, platform)
    return {"created": True, "workspace_id": ws, "user_id": boss, "device_id": device}


# ── 搜索 ────────────────────────────────────────────────────────────────

def search_messages(conn: sqlite3.Connection, needle: str, *,
                    limit: int = 40) -> list[dict]:
    """在所有未归档房间里找消息。

    ponytail: 用 LIKE 而不是 FTS5 —— 单用户本机、消息量在几万条以内够用。
    真变慢了再上 FTS5 虚表 + 触发器（那时要处理中文分词，不是免费的）。
    """
    q = needle.strip()
    if not q:
        return []
    rows = conn.execute(
        "SELECT m.conversation_id, m.text, m.created_at, m.seq, m.speaker_kind, "
        "       m.speaker_id, c.title, "
        "       COALESCE(a.name, u.name, m.speaker_id) AS speaker_name "
        "FROM messages m "
        "JOIN conversations c ON c.id = m.conversation_id AND c.archived_at IS NULL "
        "LEFT JOIN agents a ON a.id = m.speaker_id "
        "LEFT JOIN users  u ON u.id = m.speaker_id "
        "WHERE m.text LIKE ? ESCAPE '\\' "
        "ORDER BY m.created_at DESC LIMIT ?",
        (f"%{_like_escape(q)}%", limit)).fetchall()
    return [dict(r) for r in rows]


def _like_escape(s: str) -> str:
    """% 和 _ 是 LIKE 的通配符 —— 用户搞的是搜索，不是写模式。

    转义字符本身也要先转，否则用户搜一个反斜杠就把后面的转义带歪。
    """
    return s.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')


def load_page(conn: sqlite3.Connection, conversation_id: str, *,
              before: int | None = None, limit: int = 80) -> tuple[list[dict], bool]:
    """一页 transcript（从新往旧取，返回时正序）。

    返回 (messages, has_more)。长对话全量渲染会越来越卡，也没必要。
    """
    args: list = [conversation_id]
    where = "conversation_id = ?"
    if before is not None:
        where += " AND seq < ?"
        args.append(before)
    args.append(limit + 1)
    rows = conn.execute(
        f"SELECT speaker_kind, speaker_id, text, steps_json, created_at, seq "
        f"FROM messages WHERE {where} ORDER BY seq DESC LIMIT ?", args).fetchall()
    has_more = len(rows) > limit
    page = [dict(r) for r in rows[:limit]][::-1]
    return page, has_more
