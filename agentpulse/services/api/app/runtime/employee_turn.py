"""把房间的「让某员工说一轮」接到真实 dsh 员工上。

房间（`app/rooms.py`）不认识 dsh —— 它只要一个 `TurnExecutor`。这个模块就是
那根接线，也是编排层与运行时层唯一的接缝（ADR 0019 分层）。
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass

from app.rooms import Step, TurnResult
from app.runtime.dsh_client import DshBackend, RunContext


@dataclass(frozen=True)
class Employee:
    """房间发言所需的员工最小信息。工位相关字段见 ADR 0021。"""

    id: str
    name: str
    persona: str
    workdir: str                    # 绝对路径（ADR 0005）
    session_root: str | None = None  # 员工自己的账本；None = workdir/.sessions
    session_id: str | None = None    # 传入即续跑，保持跨轮上下文连续
    api_key: str | None = None


def make_turn_executor(
    backend: DshBackend,
    lookup: Callable[[str], Employee],
    *,
    api_base: str,
    conversation_id: str = "",
    run_token: str = "",
    on_session: Callable[[str, str], None] | None = None,
):
    """返回房间要的 `execute_turn(agent_id, prompt) -> TurnResult`。

    ``on_session`` 在每轮结束时收到 (agent_id, dsh_session_id) —— 存下来下一轮
    续跑，员工的上下文才是连续的。
    """

    def _run_blocking(emp: Employee, prompt: str, agent_id: str) -> TurnResult:
        """dsh 的 SDK 是同步阻塞的 —— 这个函数必须在线程里跑。"""
        text = ""
        asked_boss = False
        session_id = None
        steps: list[Step] = []
        for event in backend.run(RunContext(
            run_id=f"{agent_id}-turn",
            agent_id=agent_id,
            conversation_id=conversation_id,
            prompt=prompt,
            workdir=emp.workdir,
            persona=emp.persona,
            session_id=emp.session_id,
            session_root=emp.session_root,
            api_key=emp.api_key,
            api_base=api_base,
            run_token=run_token,
        )):
            if event.type == "final":
                text = event.payload.get("text", "")
                session_id = event.payload.get("session_id")
            elif event.type == "tool_call":
                # 员工请老板拍板 / 发问 —— 经人机桥发生（ADR 0022）。
                # 房间不据此改行为，但调用方要看得到。
                name = (event.payload.get("raw", {}).get("data") or {}).get("name")
                if name == "ask_user_question":
                    asked_boss = True
        if steps:
            result_steps = steps
        else:
            result_steps = []
        if session_id and on_session is not None:
            on_session(agent_id, session_id)   # 下一轮续跑它，上下文才连续
        return TurnResult(text=text, asked_boss=asked_boss, steps=result_steps)

    async def execute_turn(agent_id: str, prompt: str) -> TurnResult:
        # 丢到线程里。直接 await 一个阻塞调用会冻住整个事件循环 —— 员工思考
        # 的一分钟里 SSE 推送和所有其他请求都会停摆。
        emp = lookup(agent_id)
        return await asyncio.to_thread(_run_blocking, emp, prompt, agent_id)

    return execute_turn


def _say_tool(name: str, raw_args) -> str:
    """把工具调用说成人话。老板不该读 JSON 才知道员工在干什么。"""
    import json
    args: dict = {}
    if isinstance(raw_args, str):
        try:
            args = json.loads(raw_args)
        except ValueError:
            args = {}
    elif isinstance(raw_args, dict):
        args = raw_args

    if name in ("bash", "bash_persistent"):
        cmd = str(args.get("command", "")).strip()
        return f"跑了命令 {cmd[:70]}" if cmd else "跑了个命令"
    if name in ("str_replace_editor", "fs", "tool_fs"):
        path = str(args.get("path") or args.get("file_path") or "")
        verb = {"view": "读了", "create": "新建了", "str_replace": "改了"}.get(
            str(args.get("command", "")), "动了")
        return f"{verb} {path.rsplit('/', 1)[-1] or path}" if path else f"{verb}一个文件"
    if "web" in name or "search" in name:
        q = str(args.get("query") or args.get("url") or "")
        return f"查了 {q[:60]}" if q else "上网查了点东西"
    return f"用了 {name}"
