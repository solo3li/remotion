"""SQLite 落库 —— 10 张表，公司事实的真相源。

只支持 SQLite，故意的：P1 零服务器、单机（ADR 0021），不需要 PostgreSQL，
也就不需要旧版那套 sqlite/postgres 占位符方言转换。

**员工的记忆和履历不在这里** —— 那是 dsh 的 session 账本（ADR 0019）。这里只
存"公司事实"：谁在公司、有哪些房间、说过什么话、什么在等老板拍板、谁占着哪个
资源。旧版把 agent_memories / agent_experiences / context_manifests /
memory_links / run_steps 全建了表，那是在 Hermes 外面重造 Hermes 没给的东西。
"""

from __future__ import annotations

import sqlite3
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

SCHEMA = """
-- 公司
CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

-- 模型凭证。公司级一把兜底，员工级可覆盖（贵模型只给主笔用）。
-- **只存密文**：Fernet 加密，密钥在 AGENTPULSE_HOME/secret.key（0600）。
-- 明文永不落库、永不进日志、永不经接口返回。
CREATE TABLE IF NOT EXISTS model_keys (
  scope       TEXT NOT NULL CHECK (scope IN ('workspace','agent')),
  scope_id    TEXT NOT NULL,
  ciphertext  TEXT NOT NULL,
  tail        TEXT NOT NULL,   -- 末四位，只为了让老板认出自己填的是哪把
  base_url    TEXT,            -- 走代理或自建端点时用
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (scope, scope_id)
);

-- 老板（P1 只有一个，但留着表，P4 多租户时不用改形状）
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

-- 注册过的设备。本机员工的工位指向这里（ADR 0021）
CREATE TABLE IF NOT EXISTS devices (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  platform      TEXT NOT NULL CHECK (platform IN ('macos','windows','linux')),
  last_seen_at  TEXT,
  created_at    TEXT NOT NULL
);

-- 员工。一个员工 = 一个 agent（ADR 0020）
CREATE TABLE IF NOT EXISTS agents (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  persona       TEXT NOT NULL,
  -- 工位：入职时定，之后不改（ADR 0021）。下面有 trigger 真强制。
  workstation   TEXT NOT NULL CHECK (workstation IN ('cloud','device')),
  device_id     TEXT REFERENCES devices(id) ON DELETE RESTRICT,
  -- 该员工在 dsh 侧的账本目录与最近一次 session，续跑靠它保持上下文连续
  session_root  TEXT,
  session_id    TEXT,
  created_at    TEXT NOT NULL,
  -- 本机员工必须有设备，云员工必须没有
  CHECK ((workstation = 'device') = (device_id IS NOT NULL))
);

-- 工位不可漂移。允许改就等于允许同一员工两份记忆（ADR 0021）。
-- 真要调岗得显式迁移账本，那是另一条代码路径，不是一次 UPDATE。
CREATE TRIGGER IF NOT EXISTS agents_workstation_is_immutable
BEFORE UPDATE OF workstation, device_id ON agents
WHEN OLD.workstation IS NOT NEW.workstation OR OLD.device_id IS NOT NEW.device_id
BEGIN
  SELECT RAISE(ABORT, 'workstation is immutable (ADR 0021): migrate the ledger instead');
END;

-- 房间。私聊 = 参与者为 2 的房间，不分类型（ADR 0020/0023）
CREATE TABLE IF NOT EXISTS conversations (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title         TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  archived_at   TEXT
);

-- 参与者。老板和员工都是参与者，所以是多态的
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id  TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  member_kind      TEXT NOT NULL CHECK (member_kind IN ('boss','agent')),
  member_id        TEXT NOT NULL,
  -- 谁把他拉进来的（员工也能拉人，且必须可见 —— ADR 0023）
  invited_by       TEXT,
  invited_reason   TEXT,
  joined_at        TEXT NOT NULL,
  left_at          TEXT,
  PRIMARY KEY (conversation_id, member_kind, member_id)
);

-- transcript
CREATE TABLE IF NOT EXISTS messages (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  speaker_kind     TEXT NOT NULL CHECK (speaker_kind IN ('boss','agent','system')),
  speaker_id       TEXT NOT NULL,
  text             TEXT NOT NULL,
  -- 该发言所属的 dsh Run（可空：老板的话不来自 Run）
  run_id           TEXT REFERENCES runs(id) ON DELETE SET NULL,
  -- 这条发言背后的过程（读了什么、跑了什么命令）。老板要能看见凭什么。
  steps_json       TEXT,
  created_at       TEXT NOT NULL,
  seq              INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_transcript
  ON messages(conversation_id, seq);

-- 等老板拍板的事。问答和拍板共用一张表 —— 它们是同一条链（ADR 0022）
CREATE TABLE IF NOT EXISTS asks (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  agent_id         TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('question','approval')),
  -- question: dsh 的 AskUserQuestionItem[]；approval: {tool_name, call_id, reason}
  payload_json     TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','answered','expired','cancelled')),
  -- question: {answers:[...]}；approval: {decision:'approve'|'reject'|'cancel'}
  answer_json      TEXT,
  created_at       TEXT NOT NULL,
  answered_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_asks_pending
  ON asks(status, created_at);

-- dsh Run 的投影。真相源是 dsh 的 session 账本，这里只为了"谁在忙什么"
CREATE TABLE IF NOT EXISTS runs (
  id               TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id         TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  conversation_id  TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  dsh_session_id   TEXT,
  status           TEXT NOT NULL DEFAULT 'running'
                     CHECK (status IN ('running','waiting_boss','completed','failed','cancelled')),
  started_at       TEXT NOT NULL,
  ended_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_agent_foreground
  ON runs(agent_id, status);

-- 资源租约。会冲突的是资源，不是员工（ADR 0021，照搬旧版 ADR 0017）
CREATE TABLE IF NOT EXISTS resource_leases (
  id             TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  resource_type  TEXT NOT NULL CHECK (resource_type IN (
                   'git_worktree','project_write','local_terminal',
                   'computer_use','browser_context','model')),
  resource_key   TEXT NOT NULL,
  mode           TEXT NOT NULL DEFAULT 'exclusive'
                   CHECK (mode IN ('shared','exclusive')),
  agent_id       TEXT REFERENCES agents(id) ON DELETE CASCADE,
  run_id         TEXT REFERENCES runs(id) ON DELETE CASCADE,
  expires_at     TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  released_at    TEXT
);
-- 同一个资源同一时刻只有一个活的独占租约。靠索引强制，不靠应用层自觉。
CREATE UNIQUE INDEX IF NOT EXISTS idx_leases_one_exclusive
  ON resource_leases(workspace_id, resource_type, resource_key)
  WHERE mode = 'exclusive' AND released_at IS NULL;
"""


def now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def new_id() -> str:
    return uuid.uuid4().hex


def connect(path: str | Path) -> sqlite3.Connection:
    """打开（并按需初始化）一个库。

    WAL：房间在写的时候三端还要能读。
    foreign_keys：SQLite 默认是关的，不开等于没写那些 REFERENCES。
    """
    conn = sqlite3.connect(str(path), isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.executescript(SCHEMA)
    return conn


@contextmanager
def tx(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    """一个事务。isolation_level=None 意味着要自己 BEGIN。"""
    conn.execute("BEGIN")
    try:
        yield conn
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    else:
        conn.execute("COMMIT")
