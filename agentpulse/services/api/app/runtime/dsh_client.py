"""DshBackend —— 用 DeepSeek Harness 驱动一个 AgentPulse 员工。

取代旧的 HermesBackend（ACP over stdio）。传输改为 dsh 官方 Python SDK
（newline-delimited JSON-RPC over stdio，见 ADR 0019）。

一个员工 = 一个 dsh runtime 子进程 + 一份 composition：
  - 人格(SOUL) 走 `dsh-system-prompt` 的进程级 config
  - 记忆/履历 由 dsh 的 session 账本承担，不再自建表
  - 审批 由 `dsh-user-approval` + 我们的 agentpulse-approval 插件承担

安全（ADR 0005 继续有效，不外包给 dsh sandbox）：``workdir`` 必须是绝对路径，
且由调用方保证不落在 UnitPulse 仓库内。
"""

from __future__ import annotations

import os
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from pathlib import Path

_HERE = Path(__file__).parent
COMPOSITION_DIR = _HERE / "composition"
TEMPLATE = COMPOSITION_DIR / "employee.cordis.yml"
BRIDGE_PLUGIN = COMPOSITION_DIR / "agentpulse-bridge.mjs"

# dsh 真实事件类型 → AgentPulse 的粗粒度事件（P0 实测观察到的类型，未凭空添加）。
_EVENT_MAP = {
    "assistant/message": "message",
    "tool/call": "tool_call",
    "tool/result": "tool_result",
    # turn/end 故意不映射 —— 我们在流末尾追加自己的 final（带 session_id /
    # finish_reason / 聚合文本）。两者都映射会让消费方收到两个 final。
}


class DshBackendError(RuntimeError):
    pass


@dataclass
class RunContext:
    run_id: str
    agent_id: str          # 桥要用它告诉 API 是谁在问
    prompt: str
    workdir: str          # 绝对隔离目录（ADR 0005）
    conversation_id: str = ""   # 桥要用它把 ask 落在对话旁边
    persona: str = ""     # 员工 SOUL
    session_id: str | None = None   # 传入即续跑同一 session
    session_root: str | None = None  # 员工的会话账本目录
    model: str = "deepseek-v4-flash"
    api_key: str | None = None       # BYOK：每员工独立
    api_base: str = ""               # 人机桥打回 AgentPulse 的地址
    run_token: str = ""              # 每 Run 一个，桥用它认证
    environment: dict[str, str] = field(default_factory=dict)


@dataclass
class AgentEvent:
    type: str             # message | tool_call | tool_result | final | raw
    payload: dict = field(default_factory=dict)


def render_composition(cache_dir: Path) -> Path:
    """把 composition 模板渲染成带绝对插件路径的实体文件。

    `name` 位置不能用 `!!js process.env.X` —— loader 会拿到 Object 而非
    string 并 fail loud（P0 实测）。所以插件路径必须在这里替换。
    """
    if not TEMPLATE.exists():  # pragma: no cover - 打包缺文件
        raise DshBackendError(f"composition template missing: {TEMPLATE}")
    cache_dir.mkdir(parents=True, exist_ok=True)
    out = cache_dir / "employee.cordis.yml"
    out.write_text(
        TEMPLATE.read_text().replace("{{BRIDGE_PLUGIN}}", str(BRIDGE_PLUGIN.resolve()))
    )
    return out


class DshBackend:
    """把一次 Run 变成 AgentEvent 流。"""

    def __init__(self, *, cache_dir: str | os.PathLike[str]) -> None:
        self.cordis = render_composition(Path(cache_dir))

    def run(self, ctx: RunContext) -> Iterator[AgentEvent]:
        workdir = Path(ctx.workdir)
        if not workdir.is_absolute():
            raise DshBackendError(f"workdir must be absolute (ADR 0005): {ctx.workdir!r}")

        from deepseek_harness import DeepSeekHarness, DeepSeekHarnessConfig

        if not ctx.api_base:
            raise DshBackendError(
                "api_base is required: without it the bridge cannot reach a human, "
                "and every approval fails closed (ADR 0020/0021)"
            )
        env = dict(ctx.environment)
        env["AGENTPULSE_PERSONA"] = ctx.persona
        env["AGENTPULSE_API_BASE"] = ctx.api_base
        env["AGENTPULSE_RUN_TOKEN"] = ctx.run_token
        env["AGENTPULSE_AGENT_ID"] = ctx.agent_id
        env["AGENTPULSE_CONVERSATION_ID"] = ctx.conversation_id

        harness = DeepSeekHarness(DeepSeekHarnessConfig(
            cwd=str(workdir),
            session_root=ctx.session_root or str(workdir / ".sessions"),
            cordis=str(self.cordis),
            model=ctx.model,
            api_key=ctx.api_key,
            env=env,
        ))
        try:
            result = harness.run(ctx.prompt, session_id=ctx.session_id)
        finally:
            harness.close()

        for event in result.events:
            kind = _EVENT_MAP.get(event.get("type", ""))
            if kind:
                yield AgentEvent(type=kind, payload={"raw": event})
        yield AgentEvent(type="final", payload={
            "session_id": result.session_id,
            "text": result.final_response,
            "finish_reason": result.finish_reason,
        })
