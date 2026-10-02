"""DshBackend + 人机桥的可运行校验。

真跑 dsh（要 DEEPSEEK_API_KEY，会真调 API）的用例守卫在 DSH_E2E=1 后面；
其余常开、不花钱。
"""
from __future__ import annotations

import json
import os
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

from app.runtime.dsh_client import (
    BRIDGE_PLUGIN, DshBackend, DshBackendError, RunContext, render_composition,
)


# ── 常开：结构与边界 ────────────────────────────────────────────────────

def test_composition_renders_absolute_plugin_path():
    """`name` 位置必须是字面绝对路径 —— !!js 会让 loader fail loud。"""
    with tempfile.TemporaryDirectory() as d:
        text = render_composition(Path(d)).read_text()
        assert "{{BRIDGE_PLUGIN}}" not in text
        assert str(BRIDGE_PLUGIN.resolve()) in text
        assert BRIDGE_PLUGIN.resolve().is_absolute()


def test_relative_workdir_refused():
    """ADR 0005：workdir 必须绝对路径。"""
    with tempfile.TemporaryDirectory() as d:
        with pytest.raises(DshBackendError, match="absolute"):
            list(DshBackend(cache_dir=d).run(
                RunContext(run_id="r", agent_id="a1", prompt="hi",
                           workdir="relative/path", api_base="http://127.0.0.1:1")))


def test_missing_api_base_refused():
    """没有 api_base，桥就问不到人，所有审批会静默 fail-closed —— 宁可开不起来。"""
    with tempfile.TemporaryDirectory() as d:
        with pytest.raises(DshBackendError, match="api_base"):
            list(DshBackend(cache_dir=d).run(
                RunContext(run_id="r", agent_id="a1", prompt="hi",
                           workdir=str(Path(d).resolve()))))


# ── 假老板：桥打回来时按脚本回答 ────────────────────────────────────────

class _Boss:
    """替代 AgentPulse API 的最小端点，记录桥送来了什么。"""

    def __init__(self, answer: str):
        self.answer = answer
        self.asked: list[dict] = []
        outer = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):  # 别污染测试输出
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["content-length"])))
                outer.asked.append({"path": self.path, "body": body})
                if self.path == "/internal/bridge/ask":
                    # 对每个问题都回同一个答案，形状照 dsh 的 AskUserQuestionAnswer
                    payload = {"answers": [
                        {"id": q["id"], "selected": [outer.answer]}
                        for q in body["questions"]
                    ]}
                else:
                    payload = {"decision": "approve"}
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

    def __exit__(self, *exc):
        self.httpd.shutdown()


# ── 真跑 ────────────────────────────────────────────────────────────────

@pytest.mark.skipif(os.environ.get("DSH_E2E") != "1", reason="set DSH_E2E=1 to run real dsh")
def test_real_run_with_persona():
    """人格生效 + 事件流映射 + 恰好一个 final。"""
    with tempfile.TemporaryDirectory() as d, _Boss("irrelevant") as boss:
        workdir = Path(d) / "wd"
        workdir.mkdir()
        events = list(DshBackend(cache_dir=Path(d) / "cache").run(RunContext(
            run_id="smoke",
            agent_id="a1",
            prompt="What is your codename? Answer with the codename only.",
            workdir=str(workdir),
            api_base=boss.base,
            persona="You are an AgentPulse employee. Your codename is EMPLOYEE-7. "
                    "Always answer with your codename when asked.",
        )))
        finals = [e for e in events if e.type == "final"]
        assert len(finals) == 1, [e.type for e in events]
        assert finals[0].payload["finish_reason"] == "completed"
        assert "EMPLOYEE-7" in finals[0].payload["text"], finals[0].payload["text"]


@pytest.mark.skipif(os.environ.get("DSH_E2E") != "1", reason="set DSH_E2E=1 to run real dsh")
def test_employee_asks_the_boss_and_uses_the_answer():
    """北极星②：背景不清楚，员工必须发问 —— 而且老板的回答要真的流回模型。

    断言用一个模型编不出来的词：只有老板答了 'Zephyrnet'，员工才可能说出它。
    """
    with tempfile.TemporaryDirectory() as d, _Boss("Zephyrnet") as boss:
        workdir = Path(d) / "wd"
        workdir.mkdir()
        events = list(DshBackend(cache_dir=Path(d) / "cache").run(RunContext(
            run_id="ask",
            agent_id="a1",
            prompt="Write a one-sentence promo blurb for our product. I have not told "
                   "you which platform it is for. Ask me first, then write it.",
            workdir=str(workdir),
            api_base=boss.base,
            persona="You are an AgentPulse employee. When a task lacks information you "
                    "MUST use your ask_user_question tool to ask the boss before doing "
                    "the work. Never guess.",
        )))
        # 1. 桥真的被调用了
        asks = [a for a in boss.asked if a["path"] == "/internal/bridge/ask"]
        assert asks, f"bridge never reached the boss; got {boss.asked}"
        # 2. 送来的是 dsh 的 AskUserQuestionItem 形状
        q = asks[0]["body"]["questions"][0]
        assert "id" in q and "question" in q, q
        # 3. 老板的回答真的回到了模型
        final = [e for e in events if e.type == "final"][-1].payload["text"]
        assert "Zephyrnet" in final, final
