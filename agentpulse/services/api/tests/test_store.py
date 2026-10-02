"""落库层测试。真 SQLite（临时文件），不 mock —— 要测的正是 schema 的约束。"""
from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

import pytest

from app.db import connect
from app.rooms import Member, TurnResult, Utterance, run_discussion
from app.store import (
    LeaseTaken, acquire_lease, answer_ask, create_user, create_workspace,
    get_agent, hire, invite, load_members,
    load_transcript, open_room, pending_asks, record_ask, register_device,
    release_lease, remember_session, say,
)


@pytest.fixture
def db(tmp_path):
    conn = connect(tmp_path / "t.db")
    yield conn
    conn.close()


@pytest.fixture
def company(db):
    wid = create_workspace(db, "我的公司")
    uid = create_user(db, wid, "老板")
    return {"ws": wid, "boss": uid}


# ── schema 真的在管事 ────────────────────────────────────────────────────

def test_foreign_keys_are_enforced(db):
    """SQLite 默认关闭外键 —— 不开等于那些 REFERENCES 是注释。"""
    with pytest.raises(sqlite3.IntegrityError):
        hire(db, "no-such-workspace", "幽灵", "p", workstation="cloud")


def test_local_employee_must_have_a_device(db, company):
    with pytest.raises(sqlite3.IntegrityError):
        hire(db, company["ws"], "阿伦", "p", workstation="device", device_id=None)


def test_cloud_employee_must_not_have_a_device(db, company):
    did = register_device(db, company["ws"], "我的 Mac", "macos")
    with pytest.raises(sqlite3.IntegrityError):
        hire(db, company["ws"], "小美", "p", workstation="cloud", device_id=did)


def test_workstation_is_immutable(db, company):
    """ADR 0021：工位漂移 = 同一员工两份记忆。trigger 真强制，不靠自觉。"""
    did = register_device(db, company["ws"], "我的 Mac", "macos")
    aid = hire(db, company["ws"], "阿伦", "p", workstation="device", device_id=did)
    with pytest.raises(sqlite3.IntegrityError, match="immutable"):
        db.execute("UPDATE agents SET workstation = 'cloud', device_id = NULL WHERE id = ?",
                   (aid,))
    assert get_agent(db, aid)["workstation"] == "device"


def test_other_agent_fields_still_updatable(db, company):
    """不可变的只有工位 —— 别把整行锁死了。"""
    aid = hire(db, company["ws"], "小美", "p", workstation="cloud")
    remember_session(db, aid, "session-abc")
    assert get_agent(db, aid)["session_id"] == "session-abc"


# ── 租约（ADR 0021）─────────────────────────────────────────────────────

def test_exclusive_lease_blocks_a_second_holder(db, company):
    """同一台机器的鼠标键盘只有一套 —— 靠唯一索引挡，不靠应用层。"""
    a = hire(db, company["ws"], "阿伦", "p", workstation="cloud")
    b = hire(db, company["ws"], "阿哲", "p", workstation="cloud")
    acquire_lease(db, company["ws"], "computer_use", "mac-1",
                  agent_id=a, expires_at="2099-01-01T00:00:00+00:00")
    with pytest.raises(LeaseTaken):
        acquire_lease(db, company["ws"], "computer_use", "mac-1",
                      agent_id=b, expires_at="2099-01-01T00:00:00+00:00")


def test_released_lease_frees_the_resource(db, company):
    a = hire(db, company["ws"], "阿伦", "p", workstation="cloud")
    b = hire(db, company["ws"], "阿哲", "p", workstation="cloud")
    lid = acquire_lease(db, company["ws"], "computer_use", "mac-1",
                        agent_id=a, expires_at="2099-01-01T00:00:00+00:00")
    release_lease(db, lid)
    acquire_lease(db, company["ws"], "computer_use", "mac-1",
                  agent_id=b, expires_at="2099-01-01T00:00:00+00:00")   # 不该抛


def test_different_worktrees_do_not_contend(db, company):
    """写任务各自一个 worktree → 可以并行。这是 ADR 0021 的核心机制。"""
    a = hire(db, company["ws"], "阿伦", "p", workstation="cloud")
    b = hire(db, company["ws"], "阿哲", "p", workstation="cloud")
    for agent, key in ((a, "myapp/wt-a"), (b, "myapp/wt-b")):
        acquire_lease(db, company["ws"], "git_worktree", key,
                      agent_id=agent, expires_at="2099-01-01T00:00:00+00:00")


# ── 房间落库 ────────────────────────────────────────────────────────────

def test_transcript_keeps_order(db, company):
    cid = open_room(db, company["ws"], "内容经营")
    for i in range(5):
        say(db, cid, "boss", company["boss"], f"第 {i} 句")
    assert [u.text for u in load_transcript(db, cid)] == [f"第 {i} 句" for i in range(5)]


def test_members_carry_names_and_boss_flag(db, company):
    cid = open_room(db, company["ws"])
    aid = hire(db, company["ws"], "阿伦", "p", workstation="cloud")
    invite(db, cid, "boss", company["boss"])
    invite(db, cid, "agent", aid)
    members = load_members(db, cid)
    assert {m.name for m in members} == {"老板", "阿伦"}
    assert [m.is_boss for m in members].count(True) == 1


def test_invite_records_who_and_why(db, company):
    """员工也能拉人，但必须可见（ADR 0023）。"""
    cid = open_room(db, company["ws"])
    a = hire(db, company["ws"], "阿伦", "p", workstation="cloud")
    b = hire(db, company["ws"], "小林", "p", workstation="cloud")
    invite(db, cid, "agent", a)
    invite(db, cid, "agent", b, invited_by=a, reason="这块要懂投放的人")
    row = db.execute("SELECT invited_by, invited_reason FROM conversation_members "
                     "WHERE member_id = ?", (b,)).fetchone()
    assert row["invited_by"] == a
    assert "投放" in row["invited_reason"]


def test_left_members_drop_out_of_the_room(db, company):
    cid = open_room(db, company["ws"])
    aid = hire(db, company["ws"], "阿伦", "p", workstation="cloud")
    invite(db, cid, "agent", aid)
    db.execute("UPDATE conversation_members SET left_at = '2026-01-01' WHERE member_id = ?",
               (aid,))
    assert load_members(db, cid) == []


# ── 等老板拍板的事 ──────────────────────────────────────────────────────

def test_ask_survives_and_can_be_answered_once(db, company):
    aid = hire(db, company["ws"], "阿伦", "p", workstation="cloud")
    ask = record_ask(db, aid, "question",
                     {"questions": [{"id": "platform", "question": "发哪个平台？"}]})
    listed = pending_asks(db)
    assert len(listed) == 1
    assert listed[0]["agent_name"] == "阿伦"
    assert listed[0]["payload"]["questions"][0]["id"] == "platform"

    assert answer_ask(db, ask, {"answers": [{"id": "platform", "selected": ["小红书"]}]})
    assert pending_asks(db) == []
    # 第二次回答必须失败 —— 防手机和 Mac 同时点造成重复提交
    assert not answer_ask(db, ask, {"answers": []})


# ── 重启后讨论能接着走 ──────────────────────────────────────────────────

async def test_discussion_resumes_after_restart(tmp_path, company=None):
    """讨论跑一半、进程死掉、重开库 —— transcript 必须接得上。

    这是「落库」这一步存在的唯一理由：三端同源 + 重启不丢。
    """
    from app.store import create_user, create_workspace

    path = tmp_path / "resume.db"
    conn = connect(path)
    ws = create_workspace(conn, "公司")
    boss = create_user(conn, ws, "老板")
    a1 = hire(conn, ws, "阿伦", "p", workstation="cloud")
    a2 = hire(conn, ws, "阿哲", "p", workstation="cloud")
    cid = open_room(conn, ws, "养老号")
    for kind, mid in (("boss", boss), ("agent", a1), ("agent", a2)):
        invite(conn, cid, kind, mid)
    say(conn, cid, "boss", boss, "我们做个养老服务号")

    async def execute(agent_id, prompt):
        return TurnResult(f"{agent_id} 的看法")

    # 第一段：跑两轮，每轮落库
    async for ev in run_discussion(load_transcript(conn, cid), load_members(conn, cid),
                                   execute_turn=execute, max_turns=2):
        if ev.type == "utterance":
            say(conn, cid, "agent", ev.payload["agent_id"], ev.payload["text"])
    conn.close()          # ← 进程死了

    # 第二段：重开库，从落下来的 transcript 接着跑
    conn = connect(path)
    resumed = load_transcript(conn, cid)
    assert len(resumed) == 3, [u.text for u in resumed]
    assert resumed[0].text == "我们做个养老服务号"

    async for ev in run_discussion(resumed, load_members(conn, cid),
                                   execute_turn=execute, max_turns=1):
        if ev.type == "utterance":
            say(conn, cid, "agent", ev.payload["agent_id"], ev.payload["text"])

    final = load_transcript(conn, cid)
    assert len(final) == 4, "重启后没接上"
    assert [u.text for u in final][:3] == [u.text for u in resumed[:3]], "历史被改写了"
    conn.close()


def test_member_order_is_insertion_order_not_timestamp(db, company):
    """发言顺序必须确定。

    joined_at 只到秒级 —— 同一秒进群的人按时间戳排会并列，实际顺序落到随机
    uuid 上，导致 round-robin 选出的第一发言人每次运行都不一样。这是浏览器
    验收时被测试逮到的真 bug，靠 rowid（插入序）修。
    """
    cid = open_room(db, company["ws"])
    ids = [hire(db, company["ws"], f"员工{i}", "p", workstation="cloud") for i in range(6)]
    for aid in ids:
        invite(db, cid, "agent", aid)
    for _ in range(4):   # 多读几次，随机顺序会在某一次露出来
        assert [m.id for m in load_members(db, cid)] == ids


def test_reinviting_someone_does_not_move_them_to_the_back(db, company):
    """重新邀请一个已在群里的人不该改变发言顺序。"""
    cid = open_room(db, company["ws"])
    a = hire(db, company["ws"], "阿伦", "p", workstation="cloud")
    b = hire(db, company["ws"], "阿哲", "p", workstation="cloud")
    invite(db, cid, "agent", a)
    invite(db, cid, "agent", b)
    invite(db, cid, "agent", a, reason="再叫一次")
    assert [m.id for m in load_members(db, cid)] == [a, b]


def test_bootstrap_creates_a_usable_company_on_first_run(tmp_path):
    """打包好的 app 首次启动必须能直接招人。

    验收时真踩到了：装完启动，空状态叫你「先招一个员工」，点下去返回
    「还没有公司」—— 首次运行是死路。
    """
    from app.store import bootstrap, hire
    conn = connect(tmp_path / "fresh.db")
    out = bootstrap(conn, device_name="我的 MacBook", platform="macos")
    assert out["created"] is True
    # 自举之后，界面上那两条路必须都通
    hire(conn, out["workspace_id"], "小美", "p", workstation="cloud")
    hire(conn, out["workspace_id"], "阿伦", "p",
         workstation="device", device_id=out["device_id"])
    assert conn.execute("SELECT COUNT(*) FROM agents").fetchone()[0] == 2
    conn.close()


def test_bootstrap_is_idempotent(tmp_path):
    """第二次启动不能再建一家公司。"""
    from app.store import bootstrap
    conn = connect(tmp_path / "twice.db")
    first = bootstrap(conn, device_name="mac", platform="macos")
    second = bootstrap(conn, device_name="mac", platform="macos")
    assert second["created"] is False
    assert second["workspace_id"] == first["workspace_id"]
    assert conn.execute("SELECT COUNT(*) FROM workspaces").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM devices").fetchone()[0] == 1
    conn.close()


# ── 模型凭证 ────────────────────────────────────────────────────────────

def test_key_is_stored_encrypted_and_never_readable_back(tmp_path):
    """库里不能有明文，读接口也不能把它给回来。"""
    from app.secrets import describe, load_cipher, put_key, resolve
    conn = connect(tmp_path / "k.db")
    cipher = load_cipher(tmp_path)
    ws = create_workspace(conn, "c")
    put_key(conn, cipher, scope="workspace", scope_id=ws, plaintext="sk-not-a-real-key-0000")

    raw = conn.execute("SELECT ciphertext, tail FROM model_keys").fetchone()
    assert "sk-not-a-real-key-0000" not in raw["ciphertext"]
    assert raw["tail"] == "0000"
    # describe 只给末四位，没有明文字段
    info = describe(conn, scope="workspace", scope_id=ws)
    assert info == {"tail": "0000", "base_url": None, "updated_at": info["updated_at"]}
    assert "sk-not-a-real-key-0000" not in str(info)
    # 只有 resolve 能解出来，那是给 dsh 子进程用的
    aid = hire(conn, ws, "阿伦", "p", workstation="cloud")
    got, _ = resolve(conn, cipher, agent_id=aid, workspace_id=ws)
    assert got == "sk-not-a-real-key-0000"
    conn.close()


def test_agent_key_overrides_the_company_one(tmp_path):
    """贵模型只给主笔用 —— 员工级要能盖过公司级。"""
    from app.secrets import load_cipher, put_key, resolve
    conn = connect(tmp_path / "k2.db")
    cipher = load_cipher(tmp_path)
    ws = create_workspace(conn, "c")
    a = hire(conn, ws, "阿伦", "p", workstation="cloud")
    b = hire(conn, ws, "阿哲", "p", workstation="cloud")
    put_key(conn, cipher, scope="workspace", scope_id=ws, plaintext="company-key")
    put_key(conn, cipher, scope="agent", scope_id=a, plaintext="alun-key")
    assert resolve(conn, cipher, agent_id=a, workspace_id=ws)[0] == "alun-key"
    assert resolve(conn, cipher, agent_id=b, workspace_id=ws)[0] == "company-key"
    conn.close()


def test_secret_key_file_is_owner_only(tmp_path):
    """密钥文件必须 0600，被放宽过要拒绝启动而不是静默继续。"""
    import stat as st
    from app.secrets import SecretsError, load_cipher
    load_cipher(tmp_path)
    f = tmp_path / "secret.key"
    assert f.stat().st_mode & 0o777 == 0o600
    f.chmod(0o644)
    with pytest.raises(SecretsError, match="0600"):
        load_cipher(tmp_path)


# ── 搜索与分页 ──────────────────────────────────────────────────────────

def test_search_finds_messages_and_ignores_archived_rooms(db, company):
    from app.store import search_messages
    live = open_room(db, company["ws"], "在用的")
    gone = open_room(db, company["ws"], "归档的")
    a = hire(db, company["ws"], "阿伦", "p", workstation="cloud")
    for cid in (live, gone):
        invite(db, cid, "agent", a)
        say(db, cid, "agent", a, "上线前跑一次对比度")
    db.execute("UPDATE conversations SET archived_at = '2026-01-01' WHERE id = ?", (gone,))
    hits = search_messages(db, "对比度")
    assert len(hits) == 1
    assert hits[0]["conversation_id"] == live
    assert hits[0]["speaker_name"] == "阿伦"


def test_search_treats_wildcards_as_text(db, company):
    """用户搜的是内容，不是在写 LIKE 模式 —— % 和 _ 不能当通配符。

    注意断言的分寸：搜 % 应当命中**含有 % 字符**的那条（那是字面匹配，正确），
    但绝不能因为 % 是通配符就把不含它的消息也捞出来。
    """
    from app.store import search_messages
    cid = open_room(db, company["ws"])
    invite(db, cid, "boss", company["boss"])
    say(db, cid, "boss", company["boss"], "毛利 30% 左右")
    say(db, cid, "boss", company["boss"], "这条里没有百分号")
    say(db, cid, "boss", company["boss"], "下划线 a_b 在这")

    pct = search_messages(db, "%")
    assert [h["text"] for h in pct] == ["毛利 30% 左右"]      # 只命中真含 % 的
    assert len(search_messages(db, "30%")) == 1              # 字面量能搜到
    under = search_messages(db, "_")
    assert [h["text"] for h in under] == ["下划线 a_b 在这"]  # _ 同理


def test_pagination_walks_backwards_without_gaps_or_repeats(db, company):
    """长对话要能往上翻，且不能漏条或重复。"""
    from app.store import load_page
    cid = open_room(db, company["ws"])
    invite(db, cid, "boss", company["boss"])
    for i in range(1, 26):
        say(db, cid, "boss", company["boss"], f"第 {i} 条")

    page1, more1 = load_page(db, cid, limit=10)
    assert more1 and [m["seq"] for m in page1] == list(range(16, 26))
    page2, more2 = load_page(db, cid, before=page1[0]["seq"], limit=10)
    assert more2 and [m["seq"] for m in page2] == list(range(6, 16))
    page3, more3 = load_page(db, cid, before=page2[0]["seq"], limit=10)
    assert not more3 and [m["seq"] for m in page3] == list(range(1, 6))
    seqs = [m["seq"] for m in page3 + page2 + page1]
    assert seqs == sorted(seqs) == list(range(1, 26))   # 无漏无重
