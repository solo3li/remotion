"""房间编排的测试。全部纯函数 / 假执行器 —— 不起 dsh、不碰 DB、不花钱。"""
from __future__ import annotations

import pytest

from app.rooms import (
    Member, RoomEvent, TurnResult, Utterance, build_turn_prompt, parse_mentions,
    resolve_next_speaker, round_robin_pick, run_discussion,
)

BOSS = Member("u1", "老板", is_boss=True)
ALUN = Member("a1", "阿伦")
AZHE = Member("a2", "阿哲")
XIAOLIN = Member("a3", "小林")
ROOM = [BOSS, ALUN, AZHE, XIAOLIN]


# ── @提及 ────────────────────────────────────────────────────────────────

def test_mention_by_name_not_id():
    """老板打的是 @阿伦，不是 uuid。"""
    assert parse_mentions("@阿伦 你看下这个", ROOM) == ["a1"]


def test_mention_greedy_match_does_not_swallow_following_text():
    """中文没有空格分词 —— `@阿伦你看下` 必须仍然只匹配到阿伦。"""
    assert parse_mentions("@阿伦你看下这个", ROOM) == ["a1"]


def test_multiple_mentions_keep_order_and_dedupe():
    assert parse_mentions("@小林 和 @阿伦 一起看，@小林 主导", ROOM) == ["a3", "a1"]


def test_unknown_mention_ignored():
    assert parse_mentions("@张三 你来", ROOM) == []


# ── round-robin ─────────────────────────────────────────────────────────

def test_round_robin_picks_the_longest_silent():
    transcript = [Utterance("a1", "我说过"), Utterance("a2", "我也说过")]
    # a3 没说过 → 最久没说
    assert round_robin_pick(transcript, [ALUN, AZHE, XIAOLIN]) == "a3"


def test_round_robin_among_all_spoken_picks_earliest():
    transcript = [Utterance("a3", "早"), Utterance("a1", "中"), Utterance("a2", "晚")]
    assert round_robin_pick(transcript, [ALUN, AZHE, XIAOLIN]) == "a3"


def test_round_robin_with_no_candidates():
    assert round_robin_pick([], []) is None


# ── 三级 fallback ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_mention_wins_over_model():
    async def pick(_):
        return "a2"
    got = await resolve_next_speaker([], ROOM, pick=pick, pending_mentions=["a3"])
    assert got == "a3", "被 @ 到的人优先于模型选的人"


@pytest.mark.asyncio
async def test_model_used_when_no_mention():
    async def pick(_):
        return "a2"
    assert await resolve_next_speaker([], ROOM, pick=pick) == "a2"


@pytest.mark.asyncio
async def test_falls_back_to_round_robin_when_model_says_none():
    async def pick(_):
        return None
    assert await resolve_next_speaker([], ROOM, pick=pick) == "a1"


@pytest.mark.asyncio
async def test_model_naming_a_nonmember_is_ignored():
    """模型可能编一个不存在的 id —— 不能因此让讨论走进无效状态。"""
    async def pick(_):
        return "ghost"
    assert await resolve_next_speaker([], ROOM, pick=pick) == "a1"


@pytest.mark.asyncio
async def test_boss_is_never_chosen_as_speaker():
    """房间不替老板说话。"""
    async def pick(_):
        return "u1"
    got = await resolve_next_speaker([], ROOM, pick=pick, pending_mentions=["u1"])
    assert got != "u1"


@pytest.mark.asyncio
async def test_room_with_only_the_boss_has_no_speaker():
    assert await resolve_next_speaker([], [BOSS]) is None


# ── prompt 组装 ──────────────────────────────────────────────────────────

def test_turn_prompt_lists_colleagues_by_name_and_excludes_self():
    p = build_turn_prompt([Utterance("u1", "开始")], ROOM, "a1")
    assert "阿哲" in p and "小林" in p and "老板" in p
    assert "阿伦、" not in p and "、阿伦" not in p   # 自己不在同事名单里
    assert "ask_user_question" in p                  # 北极星②：不清楚就问


# ── 讨论循环 ────────────────────────────────────────────────────────────

async def _drain(transcript, members, **kw):
    return [e async for e in run_discussion(transcript, members, **kw)]


@pytest.mark.asyncio
async def test_discussion_stops_at_max_turns():
    calls = []

    async def execute(agent_id, prompt):
        calls.append(agent_id)
        return TurnResult(f"{agent_id} 说了点什么")

    transcript = [Utterance("u1", "我们做个小红书号")]
    events = await _drain(transcript, ROOM, execute_turn=execute, max_turns=3)
    assert len(calls) == 3
    assert events[-1].type == "stopped"
    assert events[-1].payload["reason"] == "max_turns"
    assert len(transcript) == 4   # 原始 1 条 + 3 轮


@pytest.mark.asyncio
async def test_discussion_stops_when_nobody_has_anything_to_add():
    async def execute(agent_id, prompt):
        return TurnResult("有话说")

    async def pick(_):
        return None   # 模型说没人该说了

    # 只有老板 → 选不出人
    events = await _drain([Utterance("u1", "嗯")], [BOSS],
                          execute_turn=execute, pick=pick)
    assert events[-1].payload["reason"] == "no_speaker"


@pytest.mark.asyncio
async def test_empty_reply_stops_instead_of_burning_turns():
    """员工返回空话就停 —— 别空转烧 token。"""
    async def execute(agent_id, prompt):
        return TurnResult("   ")

    events = await _drain([Utterance("u1", "嗯")], ROOM,
                          execute_turn=execute, max_turns=10)
    assert events[-1].payload["reason"] == "no_progress"
    assert events[-1].payload["turns"] == 0


@pytest.mark.asyncio
async def test_mention_in_a_reply_routes_the_next_turn():
    """阿伦在回复里 @小林 → 下一轮必须是小林。像真人对话。"""
    order = []

    async def execute(agent_id, prompt):
        order.append(agent_id)
        if agent_id == "a1":
            return TurnResult("这块得 @小林 来看")
        return TurnResult("我来看")

    async def pick(_):
        return "a1"   # 模型总选阿伦；提及必须能盖过它

    await _drain([Utterance("u1", "开始")], ROOM,
                 execute_turn=execute, pick=pick, max_turns=2)
    assert order == ["a1", "a3"]


@pytest.mark.asyncio
async def test_asked_boss_is_surfaced_on_the_event():
    """员工请老板拍板了，调用方要能看到 —— 房间不据此改行为，但要报出来。"""
    async def execute(agent_id, prompt):
        return TurnResult("方案在这，请老板定", asked_boss=True)

    events = await _drain([Utterance("u1", "开始")], ROOM,
                          execute_turn=execute, max_turns=1)
    said = [e for e in events if e.type == "utterance"]
    assert said and said[0].payload["asked_boss"] is True
