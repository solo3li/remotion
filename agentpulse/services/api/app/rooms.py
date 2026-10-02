"""房间 —— 群讨论的编排。

这是 AgentPulse 自己写的三块之一（另两块是公司事实和唤醒节奏）。dsh 不做
这个：它的 `experimental/agent-team` 只有 roster / mailbox / 任务 DAG，没有
"先讨论对齐再开工"（ADR 0002 / ADR 0020）。

房间是**基础设施，不是参与者** —— 没有主持 agent、没有 root agent，员工之间
平级（ADR 0020）。私聊 = 参与者为 2 的房间，不做第二条代码路径。

本模块**不碰 HTTP / DB / dsh**。执行一轮发言、选人用的模型调用、读写消息都由
调用方注入。旧版就是因为路由层手写了一份重复的讨论循环而漂移了两周
（见旧 TD-02 事故），所以这里的规矩是：编排逻辑只有这一份，且可纯函数测试。

「何时算讨论对齐」不在这里 —— 交给员工自己判断（ADR 0023）。房间只保证
讨论能进行、能停下。
"""

from __future__ import annotations

import re
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass, field


# 一轮讨论的硬上限。到了就停 —— 兜住"没人主动收敛"导致的无限讨论。
DEFAULT_MAX_TURNS = 12


@dataclass(frozen=True)
class Member:
    """房间里的一个参与者。老板也是参与者。"""

    id: str
    name: str
    is_boss: bool = False


@dataclass(frozen=True)
class Utterance:
    """transcript 里的一条。"""

    speaker_id: str
    text: str


@dataclass
class Step:
    """员工这一轮里做过的一件事。给老板看「他到底在干什么」。"""

    kind: str          # tool | ask
    label: str         # 人话，比如「读了 README.md」
    detail: str = ""


@dataclass
class TurnResult:
    """一个员工说完一轮的结果。"""

    text: str
    # 该员工这轮是否请老板拍板了（经人机桥发生，ADR 0022）。
    # 房间不据此改变行为，只记下来给调用方用。
    asked_boss: bool = False
    # 这一轮的过程。之前只留最终一句话 —— 老板看不到中间发生了什么，
    # 「他凭什么这么说」就无从判断。
    steps: list[Step] = field(default_factory=list)


@dataclass
class RoomEvent:
    type: str            # speaker | utterance | stopped
    payload: dict = field(default_factory=dict)


# 注入点：给定员工 id 和拼好的 prompt，跑一轮并返回结果。
TurnExecutor = Callable[[str, str], Awaitable[TurnResult]]
# 注入点：让模型从候选里挑一个发言人，返回其 id 或 None。房间自己不调模型。
SpeakerPicker = Callable[[str], Awaitable[str | None]]


_MENTION = re.compile(r"@([^\s@,，。:：]+)")


def parse_mentions(text: str, members: Sequence[Member]) -> list[str]:
    """按名字匹配 @提及，返回被提到的成员 id（保持文中出现顺序、去重）。

    按名字而不是 id 匹配 —— 老板打的是 `@阿伦`，不是 uuid。
    """
    by_name = {m.name: m.id for m in members}
    seen: list[str] = []
    for raw in _MENTION.findall(text):
        # 贪婪匹配可能带上后面的字，逐步截短找最长的真实名字
        for end in range(len(raw), 0, -1):
            mid = by_name.get(raw[:end])
            if mid is not None:
                if mid not in seen:
                    seen.append(mid)
                break
    return seen


def round_robin_pick(
    transcript: Sequence[Utterance], candidates: Sequence[Member]
) -> str | None:
    """挑最久没说话的人。全都没说过则挑第一个。"""
    if not candidates:
        return None
    spoken = [u.speaker_id for u in transcript]
    return min(
        candidates,
        key=lambda m: (
            len(spoken) - 1 - spoken[::-1].index(m.id) if m.id in spoken else -1
        ),
    ).id


async def resolve_next_speaker(
    transcript: Sequence[Utterance],
    members: Sequence[Member],
    *,
    pick: SpeakerPicker | None = None,
    pending_mentions: Sequence[str] = (),
) -> str | None:
    """三级 fallback：待回应的 @提及 → 模型选 → round-robin。

    老板永远不会被选为发言人 —— 房间不替老板说话。
    """
    employees = [m for m in members if not m.is_boss]
    if not employees:
        return None
    valid = {m.id for m in employees}

    for mid in pending_mentions:
        if mid in valid:
            return mid

    if pick is not None:
        chosen = await pick(build_speaker_prompt(transcript, employees))
        if chosen in valid:
            return chosen

    return round_robin_pick(transcript, employees)


def build_speaker_prompt(
    transcript: Sequence[Utterance], employees: Sequence[Member]
) -> str:
    """给选人模型的 prompt。允许它回 none —— 没人有话说就该停。"""
    roster = "\n".join(f"- {m.id}: {m.name}" for m in employees)
    lines = "\n".join(f"{u.speaker_id}: {u.text}" for u in transcript[-20:])
    return (
        "以下是一个工作群的对话。谁最该接着说话？\n\n"
        f"成员:\n{roster}\n\n对话:\n{lines}\n\n"
        "只回一个成员 id。如果背景已经讲清楚、没人需要补充，回 none。"
    )


def build_turn_prompt(
    transcript: Sequence[Utterance], members: Sequence[Member], speaker_id: str
) -> str:
    """给要发言的员工的 prompt。

    人格不在这里 —— 它在员工自己的 dsh composition 里（ADR 0019）。这里只给
    共享 transcript 和"你是谁、群里有谁"。
    """
    names = {m.id: m.name for m in members}
    roster = "、".join(m.name for m in members if m.id != speaker_id) or "（只有你）"
    lines = "\n".join(f"{names.get(u.speaker_id, u.speaker_id)}: {u.text}" for u in transcript)
    return (
        f"你在一个工作群里，群里还有：{roster}。\n\n"
        f"对话记录:\n{lines}\n\n"
        "接着说你的。背景不清楚就用 ask_user_question 问老板，别猜。"
        "该请老板拍板方案时也用它。"
    )


async def run_discussion(
    transcript: list[Utterance],
    members: Sequence[Member],
    *,
    execute_turn: TurnExecutor,
    pick: SpeakerPicker | None = None,
    max_turns: int = DEFAULT_MAX_TURNS,
):
    """把讨论推进到停下来，边推进边 yield 事件。

    停止条件（三个都是真的停，不是静默 break）：
      - `no_speaker`   选不出人（模型回 none 且没有员工）→ 讨论自然结束
      - `max_turns`    到硬上限 → 兜住无限讨论
      - `no_progress`  员工返回空话 → 别空转烧钱

    transcript 会被就地追加，调用方拿到的是同一个 list。
    """
    last_mentions = parse_mentions(transcript[-1].text, members) if transcript else []

    for turn in range(max_turns):
        speaker_id = await resolve_next_speaker(
            transcript, members, pick=pick, pending_mentions=last_mentions
        )
        if speaker_id is None:
            yield RoomEvent("stopped", {"reason": "no_speaker", "turns": turn})
            return

        yield RoomEvent("speaker", {"agent_id": speaker_id, "turn": turn})
        result = await execute_turn(
            speaker_id, build_turn_prompt(transcript, members, speaker_id)
        )

        if not result.text.strip():
            yield RoomEvent("stopped", {"reason": "no_progress", "turns": turn})
            return

        utterance = Utterance(speaker_id, result.text)
        transcript.append(utterance)
        last_mentions = parse_mentions(result.text, members)
        yield RoomEvent("utterance", {
            "agent_id": speaker_id,
            "text": result.text,
            "asked_boss": result.asked_boss,
            "steps": [{"kind": s.kind, "label": s.label, "detail": s.detail}
                      for s in result.steps],
            "turn": turn,
        })

    yield RoomEvent("stopped", {"reason": "max_turns", "turns": max_turns})
