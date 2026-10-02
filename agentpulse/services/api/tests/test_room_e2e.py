"""房间 + 真 dsh 员工的端到端 —— P1 闸门的预演。

守卫在 DSH_E2E=1 后面（会起真进程、真调 DeepSeek）。
"""
from __future__ import annotations

import json
import os
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

from app.rooms import Member, Utterance, run_discussion
from app.runtime.dsh_client import DshBackend
from app.runtime.employee_turn import Employee, make_turn_executor

pytestmark = pytest.mark.skipif(
    os.environ.get("DSH_E2E") != "1", reason="set DSH_E2E=1 to run real dsh"
)


class _Boss:
    """假老板端点：员工经人机桥问上来时，按脚本回答。"""

    def __init__(self, answer: str):
        self.answer, self.asked = answer, []
        outer = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a): pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["content-length"])))
                outer.asked.append(body)
                payload = (
                    {"answers": [{"id": q["id"], "selected": [outer.answer]}
                                 for q in body["questions"]]}
                    if self.path == "/internal/bridge/ask" else {"decision": "approve"}
                )
                raw = json.dumps(payload).encode()
                self.send_response(200)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

        self.httpd = HTTPServer(("127.0.0.1", 0), H)
        self.base = f"http://127.0.0.1:{self.httpd.server_port}"

    def __enter__(self):
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        return self

    def __exit__(self, *e):
        self.httpd.shutdown()


async def test_two_real_employees_hold_a_discussion():
    """两个真员工在一个房间里轮流发言，各自守住自己的人格。

    这是「员工就是 agent、平级同事」（ADR 0020）第一次真跑：两个独立 dsh
    进程、各自的人格与账本，房间只做发言路由。
    """
    with tempfile.TemporaryDirectory() as d, _Boss("小红书") as boss:
        root = Path(d)
        staff = {
            "a1": Employee(
                id="a1", name="阿伦",
                persona="你是 AgentPulse 的内容主笔阿伦。你的工号是 W-CONTENT。"
                        "发言必须以「[W-CONTENT]」开头。只谈内容创作，两句话以内。",
                workdir=str(_mk(root / "alun")),
                session_root=str(root / "alun-sessions"),
            ),
            "a2": Employee(
                id="a2", name="阿哲",
                persona="你是 AgentPulse 的数据分析师阿哲。你的工号是 W-DATA。"
                        "发言必须以「[W-DATA]」开头。只谈数据与衡量，两句话以内。",
                workdir=str(_mk(root / "azhe")),
                session_root=str(root / "azhe-sessions"),
            ),
        }
        members = [Member("u1", "老板", is_boss=True),
                   Member("a1", "阿伦"), Member("a2", "阿哲")]

        execute = make_turn_executor(
            DshBackend(cache_dir=root / "cache"),
            staff.__getitem__,
            api_base=boss.base,
        )
        transcript = [Utterance("u1", "我们要做一个养老服务的自媒体号，先聊聊怎么干。")]
        events = [e async for e in run_discussion(
            transcript, members, execute_turn=execute, max_turns=2)]

        spoke = [e.payload["agent_id"] for e in events if e.type == "utterance"]
        assert spoke == ["a1", "a2"], f"round-robin 应轮到两人各一次，实际 {spoke}"

        said = {e.payload["agent_id"]: e.payload["text"] for e in events
                if e.type == "utterance"}
        # 人格真的隔离了：各自只认自己的工号
        assert "W-CONTENT" in said["a1"], said["a1"]
        assert "W-DATA" in said["a2"], said["a2"]
        assert "W-DATA" not in said["a1"], "阿伦串到了阿哲的人格"
        # 第二个人看得到第一个人说了什么（共享 transcript）
        assert len(transcript) == 3


def _mk(p: Path) -> Path:
    p.mkdir(parents=True, exist_ok=True)
    return p
