"""HTTP 层测试。真 FastAPI + 真 SQLite，假员工（不起 dsh、不花钱）。"""
from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from app import store
from app.api import Deps, create_app
from app.bus import AskBus, EventBus
from app.db import connect
from app.rooms import TurnResult
from app.store import create_user, create_workspace, hire, invite, open_room


@pytest.fixture
def live(ctx):
    """起一个真 uvicorn。

    SSE 必须这么测：httpx 的 ASGITransport 不支持流式响应（它缓冲整个 body），
    而 Starlette 的 StreamingResponse 会一直等 receive() 的 http.disconnect
    —— 两者一碰，c.stream() 在进入时就挂死。这不是本项目的 bug，但也意味着
    ASGITransport 测不了 SSE，而 SSE 正是三端同源的机制，必须真测。
    """
    import socket
    import threading
    import time

    import uvicorn

    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(create_app(ctx["deps"]), log_level="error"))
    thread = threading.Thread(target=lambda: server.run(sockets=[sock]), daemon=True)
    thread.start()
    for _ in range(200):
        if server.started:
            break
        time.sleep(0.02)
    assert server.started, "uvicorn 没起来"
    yield {**ctx, "base": f"http://127.0.0.1:{port}"}
    server.should_exit = True
    thread.join(timeout=5)


@pytest.fixture
def ctx(tmp_path):
    conn = connect(tmp_path / "api.db")
    ws = create_workspace(conn, "我的公司")
    boss = create_user(conn, ws, "老板")
    alun = hire(conn, ws, "阿伦", "内容主笔", workstation="cloud")
    azhe = hire(conn, ws, "阿哲", "数据分析", workstation="cloud")
    room = open_room(conn, ws, "养老号")
    for kind, mid in (("boss", boss), ("agent", alun), ("agent", azhe)):
        invite(conn, room, kind, mid)
    deps = Deps(conn=conn, asks=AskBus(), events=EventBus(), ask_timeout=2.0)
    yield {"deps": deps, "conn": conn, "ws": ws, "boss": boss,
           "alun": alun, "azhe": azhe, "room": room}
    conn.close()


def client_for(deps):
    app = create_app(deps)
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                             base_url="http://t")


# ── 桥 ↔ 老板的完整往返 ──────────────────────────────────────────────────

async def test_bridge_blocks_until_the_boss_answers_from_another_client(ctx):
    """这是整个 P1 交互的核心：员工问上来会一直等，老板在**另一个**请求里
    回答（可能来自手机），答案回到员工手上。"""
    async with client_for(ctx["deps"]) as c:
        bridge = asyncio.create_task(c.post("/internal/bridge/ask", json={
            "agent_id": ctx["alun"],
            "conversation_id": ctx["room"],
            "questions": [{"id": "platform", "question": "发哪个平台？"}],
        }))

        # 等它落库并挂起
        for _ in range(50):
            listed = (await c.get("/asks")).json()["asks"]
            if listed:
                break
            await asyncio.sleep(0.02)
        assert listed, "问题没出现在待办里"
        assert listed[0]["agent_name"] == "阿伦"
        assert not bridge.done(), "桥不该在老板回答前返回"

        # 老板在另一个请求里回答
        res = await c.post(f"/asks/{listed[0]['id']}/answer",
                           json={"answers": [{"id": "platform", "selected": ["小红书"]}]})
        assert res.json()["delivered_to_employee"] is True

        answer = (await asyncio.wait_for(bridge, 5)).json()
        assert answer["answers"][0]["selected"] == ["小红书"]
        assert (await c.get("/asks")).json()["asks"] == []


async def test_answer_lands_in_the_transcript(live):
    """回答本身就是老板在群里说的一句话（ADR 0020）。

    不落成消息的话，卡片一消失老板就不知道自己刚答了什么，决策也不进记录 ——
    这是浏览器里实测出来的 UX bug，修法是让 transcript 成为唯一的记录。
    """
    from app.store import record_ask
    ask_id = record_ask(live["conn"], live["alun"], "question",
                        {"questions": [{"id": "audience", "question": "写给谁看？"}]},
                        conversation_id=live["room"])
    async with httpx.AsyncClient(base_url=live["base"]) as c:
        await c.post(f"/asks/{ask_id}/answer",
                     json={"answers": [{"id": "audience", "selected": ["老人的子女"]}]})
        msgs = (await c.get(f"/rooms/{live['room']}")).json()["messages"]
    assert msgs and msgs[-1]["text"] == "老人的子女"
    assert msgs[-1]["speaker_kind"] == "boss"


async def test_approval_decision_lands_in_the_transcript(live):
    from app.store import record_ask
    ask_id = record_ask(live["conn"], live["azhe"], "approval", {"tool_name": "bash"},
                        conversation_id=live["room"])
    async with httpx.AsyncClient(base_url=live["base"]) as c:
        await c.post(f"/asks/{ask_id}/answer", json={"decision": "reject"})
        msgs = (await c.get(f"/rooms/{live['room']}")).json()["messages"]
    assert "不行" in msgs[-1]["text"], msgs[-1]["text"]


async def test_answering_twice_is_a_conflict(ctx):
    """手机和 Mac 同时点提交 —— 第二次必须失败，不能改掉已决的事。"""
    async with client_for(ctx["deps"]) as c:
        task = asyncio.create_task(c.post("/internal/bridge/approve", json={
            "agent_id": ctx["azhe"], "tool_name": "bash", "reason": "要删目录",
        }))
        for _ in range(50):
            listed = (await c.get("/asks")).json()["asks"]
            if listed:
                break
            await asyncio.sleep(0.02)
        ask_id = listed[0]["id"]
        assert (await c.post(f"/asks/{ask_id}/answer",
                            json={"decision": "approve"})).status_code == 200
        again = await c.post(f"/asks/{ask_id}/answer", json={"decision": "reject"})
        assert again.status_code == 409
        assert (await asyncio.wait_for(task, 5)).json()["decision"] == "approve"


async def test_unanswered_ask_expires_and_the_bridge_gets_an_error(ctx):
    """老板一直不回 → 504。桥收到非 2xx 会 fail-closed，正是要的。"""
    async with client_for(ctx["deps"]) as c:
        res = await c.post("/internal/bridge/approve",
                           json={"agent_id": ctx["alun"], "tool_name": "bash"},
                           timeout=10)
        assert res.status_code == 504
        row = ctx["conn"].execute("SELECT status FROM asks").fetchone()
        assert row["status"] == "expired"


async def test_answer_without_a_waiter_still_persists(ctx):
    """API 重启过、桥的连接早断了 —— 回答仍要落库，只是送不到员工。"""
    from app.store import record_ask
    ask_id = record_ask(ctx["conn"], ctx["alun"], "approval", {"tool_name": "bash"})
    async with client_for(ctx["deps"]) as c:
        res = await c.post(f"/asks/{ask_id}/answer", json={"decision": "reject"})
        assert res.status_code == 200
        assert res.json()["delivered_to_employee"] is False


async def test_bridge_needs_a_resolvable_employee(ctx):
    async with client_for(ctx["deps"]) as c:
        res = await c.post("/internal/bridge/ask",
                           json={"session_id": "ghost", "questions": [{"id": "q"}]})
        assert res.status_code == 400


# ── 房间 ────────────────────────────────────────────────────────────────

async def test_boss_says_and_employees_discuss_in_the_background(live):
    """/say 立刻返回，讨论在后台跑并落库 —— 不能让 HTTP 挂着等一屋子人聊完。"""
    spoke = []

    def make_executor(room_id):
        async def execute(agent_id, prompt):
            spoke.append(agent_id)
            return TurnResult(f"{agent_id} 的看法")
        return execute

    live["deps"].make_executor = make_executor
    async with httpx.AsyncClient(base_url=live["base"]) as c:
        started = (await c.post(f"/rooms/{live['room']}/say",
                                json={"text": "我们做个养老号", "max_turns": 2})).json()
        assert started["ok"] is True and started["discussing"] is True
        for _ in range(150):
            msgs = (await c.get(f"/rooms/{live['room']}")).json()["messages"]
            if len(msgs) >= 3:
                break
            await asyncio.sleep(0.02)
        assert len(msgs) == 3, [m["text"] for m in msgs]
        assert msgs[0]["speaker_name"] == "老板"
        assert {m["speaker_name"] for m in msgs[1:]} == {"阿伦", "阿哲"}
        assert spoke == [live["alun"], live["azhe"]]


async def test_background_discussion_failure_surfaces_instead_of_vanishing(live):
    """员工那边炸了，必须推一条 error 出来 —— 否则老板以为员工还在思考。"""
    def make_executor(room_id):
        async def execute(agent_id, prompt):
            raise RuntimeError("dsh 挂了")
        return execute

    live["deps"].make_executor = make_executor
    got = await _collect_events(live, {"text": "开始"}, want="error")
    errors = [e for e in got if e["type"] == "error"]
    assert errors and "dsh 挂了" in errors[0]["detail"]


async def test_room_404_for_unknown_id(ctx):
    async with client_for(ctx["deps"]) as c:
        assert (await c.get("/rooms/nope")).status_code == 404


async def test_agents_report_their_workstation(ctx):
    """三端要看得出谁是本机员工、谁是云员工（ADR 0021）。"""
    async with client_for(ctx["deps"]) as c:
        agents = (await c.get("/agents")).json()["agents"]
        assert {a["name"] for a in agents} == {"阿伦", "阿哲"}
        assert all(a["workstation"] == "cloud" for a in agents)


# ── 实时推送 ────────────────────────────────────────────────────────────

async def test_sse_delivers_the_boss_message_to_a_listener(live):
    """三端同源的机制：Mac 上说的话，手机的流里立刻出现。"""
    got = await _collect_events(live, {"text": "喂"}, want="message")
    assert got[0]["type"] == "message" and got[0]["text"] == "喂"


async def _collect_events(live, say_body, *, want: str, timeout: float = 8.0):
    """订阅 SSE，发一条消息，收到 `want` 类型的事件就停。"""
    got: list[dict] = []

    async def listen(ready: asyncio.Event):
        async with httpx.AsyncClient(base_url=live["base"], timeout=timeout) as c:
            async with c.stream("GET", "/events") as r:
                async for line in r.aiter_lines():
                    if line.startswith("retry:"):
                        ready.set()          # 订阅已生效，可以发消息了
                    elif line.startswith("data: "):
                        got.append(json.loads(line[6:]))
                        if any(e["type"] == want for e in got):
                            return

    ready = asyncio.Event()
    task = asyncio.create_task(listen(ready))
    await asyncio.wait_for(ready.wait(), 5)
    async with httpx.AsyncClient(base_url=live["base"]) as c:
        await c.post(f"/rooms/{live['room']}/say", json=say_body)
    try:
        await asyncio.wait_for(task, timeout)
    except (TimeoutError, asyncio.TimeoutError):
        task.cancel()
    return got


async def test_shutdown_cancels_in_flight_discussions(ctx):
    """关闭时必须取消在飞的讨论。

    真跑时踩到的：uvicorn 优雅关闭会一直等后台讨论任务，而那个任务可能正阻塞在
    30 分钟的桥等待上 —— 进程停不下来、端口不放，新进程起不来，重启挂死。
    """
    started, cancelled = asyncio.Event(), asyncio.Event()

    def make_executor(_room):
        async def execute(_agent, _prompt):
            started.set()
            try:
                await asyncio.sleep(3600)   # 扮演一个卡在桥上的员工
            except asyncio.CancelledError:
                cancelled.set()
                raise
        return execute

    ctx["deps"].make_executor = make_executor
    app = create_app(ctx["deps"])
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                 base_url="http://t") as c:
        # 手动跑 lifespan，才能断言关闭路径
        async with app.router.lifespan_context(app):
            await c.post(f"/rooms/{ctx['room']}/say", json={"text": "开始"})
            await asyncio.wait_for(started.wait(), 5)
    # 断言真实行为（员工那轮被取消了），不去内省任务名 ——
    # 上一版用 `"_discuss" in repr(task)` 把这个测试函数自己匹配进去了。
    assert cancelled.is_set(), "关闭没有取消在飞的讨论"


async def test_ask_bus_wakes_waiters_on_shutdown():
    """关闭时在等的桥请求必须被唤醒，不能挂着到超时。"""
    from app.bus import AskBus
    bus = AskBus()
    waiter = asyncio.create_task(bus.wait("ask-1", timeout=60))
    await asyncio.sleep(0.05)
    bus.cancel_all("shutting down")
    with pytest.raises(RuntimeError, match="shutting down"):
        await asyncio.wait_for(waiter, 5)


async def test_startup_expires_asks_left_by_a_previous_run(ctx):
    """重启后遗留的 pending ask 必须失效。

    AskBus 是进程内的，重启后没有任何桥还在等这些答案 —— 留着只会让老板对着
    空气回答（真跑时侧栏里堆了三条一模一样的孤儿，就是这么来的）。
    """
    from app.store import record_ask
    record_ask(ctx["conn"], ctx["alun"], "question", {"questions": [{"id": "q"}]})
    assert len(store.pending_asks(ctx["conn"])) == 1

    app = create_app(ctx["deps"])
    async with app.router.lifespan_context(app):
        pass
    assert store.pending_asks(ctx["conn"]) == []
    row = ctx["conn"].execute("SELECT status FROM asks").fetchone()
    assert row["status"] == "expired"


async def test_model_key_write_only_never_returned(ctx, tmp_path):
    """填 key 的接口只进不出 —— 任何 GET 都不能把明文给回来。"""
    from app.secrets import load_cipher
    ctx["deps"].cipher = load_cipher(tmp_path / "vault")
    secret = "sk-placeholder-not-real-9999"
    async with client_for(ctx["deps"]) as c:
        assert (await c.get("/settings/model-key")).json() == {"supported": True, "set": False}
        assert (await c.put("/settings/model-key", json={"key": secret})).status_code == 200
        body = (await c.get("/settings/model-key")).json()
        assert body["set"] is True and body["tail"] == "9999"
        assert secret not in (await c.get("/settings/model-key")).text
        # 其他任何读接口也不该带出它
        for path in ("/agents", "/rooms", "/asks", "/devices", "/health"):
            assert secret not in (await c.get(path)).text, path
        assert (await c.delete("/settings/model-key")).status_code == 200
        assert (await c.get("/settings/model-key")).json()["set"] is False


async def test_model_key_unsupported_when_no_cipher(ctx):
    """没有加密能力的部署要如实说不支持，而不是假装存进去了。"""
    ctx["deps"].cipher = None
    async with client_for(ctx["deps"]) as c:
        assert (await c.get("/settings/model-key")).json()["supported"] is False
        assert (await c.put("/settings/model-key", json={"key": "sk-x-1234"})).status_code == 400


async def test_all_answers_of_a_multi_question_ask_land(live):
    """多问一起答时，每个问题的答案都要落进 transcript，一行一个。

    老板真用时第一个撞到的 bug：卡片点一个选项就直接提交，剩下的问题连带
    答案一起丢了。后端这边要保证多答案都记下来、读得出哪个答的是哪个。
    """
    from app.store import record_ask
    ask_id = record_ask(live["conn"], live["alun"], "question", {"questions": [
        {"id": "scope", "question": "做到哪一层？"},
        {"id": "when", "question": "什么时候要？"},
        {"id": "domain", "question": "域名有了吗？"},
    ]}, conversation_id=live["room"])
    async with httpx.AsyncClient(base_url=live["base"]) as c:
        await c.post(f"/asks/{ask_id}/answer", json={"answers": [
            {"id": "scope", "selected": ["可以，按这个来（推荐）"]},
            {"id": "when", "selected": ["1-2 周"]},
            {"id": "domain", "selected": [], "custom": "还没买，我今晚买"},
        ]})
        said = (await c.get(f"/rooms/{live['room']}")).json()["messages"][-1]["text"]
    lines = said.split("\n")
    assert lines == ["可以，按这个来", "1-2 周", "还没买，我今晚买"], said
    # 「（推荐）」是给老板看的提示，不该出现在老板说的话里
    assert "推荐" not in said


async def test_employee_process_steps_are_kept(live):
    """员工这一轮干了什么要留下来 —— 之前只存最终一句话，过程全丢。"""
    def make_executor(_room):
        async def execute(_agent, _prompt):
            from app.rooms import Step, TurnResult
            return TurnResult(text="我看过了，建议先做三页静态站。", steps=[
                Step("tool", "读了 README.md"),
                Step("tool", "跑了命令 ls apps/", "ls apps/"),
            ])
        return execute

    live["deps"].make_executor = make_executor
    async with httpx.AsyncClient(base_url=live["base"]) as c:
        await c.post(f"/rooms/{live['room']}/say", json={"text": "看下现状", "max_turns": 1})
        for _ in range(150):
            msgs = (await c.get(f"/rooms/{live['room']}")).json()["messages"]
            if len(msgs) >= 2:
                break
            await asyncio.sleep(0.02)
    steps = msgs[-1]["steps"]
    assert [s["label"] for s in steps] == ["读了 README.md", "跑了命令 ls apps/"], steps


async def test_one_discussion_per_room_at_a_time(ctx):
    """同一个房间不能并发跑两场讨论。

    真跑时踩到的：连发两句话，两场讨论一起跑，员工互相盖话，老板收到两组
    几乎一样的提问，回答也重复落进 transcript。第二句话进 transcript 就够了 ——
    在跑的那场下一轮自然会看到它。
    """
    # 数的是**讨论场数**（make_executor 每场调一次），不是发言轮数 ——
    # 一场讨论默认跑 6 轮，数轮数会得到 6，那是我第一版测试的错。
    discussions = 0
    release = asyncio.Event()

    def make_executor(_room):
        nonlocal discussions
        discussions += 1

        async def execute(_agent, _prompt):
            await release.wait()
            return TurnResult("说完了")
        return execute

    ctx["deps"].make_executor = make_executor
    async with client_for(ctx["deps"]) as c:
        first = (await c.post(f"/rooms/{ctx['room']}/say", json={"text": "第一句"})).json()
        for _ in range(100):
            if discussions:
                break
            await asyncio.sleep(0.01)
        second = (await c.post(f"/rooms/{ctx['room']}/say", json={"text": "第二句"})).json()
        assert first["discussing"] is True
        assert second.get("joined_running") is True, second
        release.set()
        await asyncio.sleep(0.1)
    assert discussions == 1, f"起了 {discussions} 场讨论"
    # 两句话都要在 transcript 里 —— 只是不额外起一场讨论
    texts = [r["text"] for r in ctx["conn"].execute(
        "SELECT text FROM messages ORDER BY seq").fetchall()]
    assert texts[:2] == ["第一句", "第二句"]
