"""启动入口。把落库、总线、dsh 运行时和 HTTP 层装到一起。

P1 就跑在老板自己的 Mac 上（ADR 0021）：
    uvicorn app.main:app --host 0.0.0.0 --port 8787
`--host 0.0.0.0` 是为了手机能从局域网连进来 —— 三端同源在 P1 靠这个。
"""

from __future__ import annotations

import os
from pathlib import Path

from app.api import Deps, create_app
from app.bus import AskBus, EventBus
from app.db import connect
from app.runtime.dsh_client import DshBackend
from app.runtime.employee_turn import Employee, make_turn_executor
from app.secrets import load_cipher, resolve as resolve_key
from app.store import bootstrap, get_agent, remember_session


def _device_name() -> str:
    """这台机器叫什么。老板在员工卡上看到的就是它。"""
    import socket
    name = socket.gethostname().removesuffix(".local").strip()
    return name or "这台电脑"


def _home() -> Path:
    """所有本机状态放一处，方便备份也方便删干净。"""
    return Path(os.environ.get("AGENTPULSE_HOME",
                               Path.home() / "Library/Application Support/AgentPulse"))


def build() -> Deps:
    home = _home()
    home.mkdir(parents=True, exist_ok=True)
    conn = connect(home / "company.db")
    cipher = load_cipher(home)

    # 开箱即用：首次启动就得有一家公司、一个老板和这台设备，否则界面上
    # 「招人」会直接失败（打包验收时真踩到了）。幂等，第二次启动什么都不做。
    bootstrap(conn, device_name=_device_name(), platform=os.environ.get("AGENTPULSE_PLATFORM", "linux"))

    port = os.environ.get("AGENTPULSE_PORT", "8787")
    # 桥从 dsh 子进程里回调这个地址。用 127.0.0.1 而不是局域网 IP：桥永远
    # 跑在同一台机器上，走 loopback 就不必把内部端点暴露到网络上。
    api_base = os.environ.get("AGENTPULSE_API_BASE", f"http://127.0.0.1:{port}")

    backend = DshBackend(cache_dir=home / "runtime-cache")

    def lookup(agent_id: str) -> Employee:
        row = get_agent(conn, agent_id)
        # 员工级 key 优先，否则公司级；两级都没有才回落环境变量（只在开发时有）
        key, _base = resolve_key(conn, cipher, agent_id=agent_id,
                                 workspace_id=row["workspace_id"])
        workdir = row["session_root"] or str(home / "workdirs" / agent_id)
        Path(workdir).mkdir(parents=True, exist_ok=True)
        return Employee(
            id=row["id"],
            name=row["name"],
            persona=row["persona"],
            workdir=workdir,                     # 绝对路径（ADR 0005）
            session_root=str(home / "ledgers" / agent_id),
            session_id=row["session_id"],
            api_key=key or os.environ.get("DEEPSEEK_API_KEY") or None,
        )

    def make_executor(room_id: str):
        return make_turn_executor(
            backend, lookup, api_base=api_base, conversation_id=room_id,
            on_session=lambda aid, sid: remember_session(conn, aid, sid),
        )

    # 桌面壳把前端产物放在这里；开发时没有这个目录，不挂
    web_root = os.environ.get("AGENTPULSE_WEB_ROOT")

    return Deps(conn=conn, asks=AskBus(), events=EventBus(),
                make_executor=make_executor, web_root=web_root, cipher=cipher)


app = create_app(build())
