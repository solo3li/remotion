"""Abstract base for any supervised binary, sidecar, or in-process task.

Every subclass owns one logical resource (a child process, an HTTP
client, a polling task) and exposes the same lifecycle surface so the
DI container, FastAPI lifespan, and StatusBroadcaster can treat all
supervisors uniformly.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, ClassVar, Optional

import anyio
from tenacity import AsyncRetrying, stop_after_attempt, wait_random_exponential

from core.logging import get_logger


@dataclass(frozen=True)
class RestartPolicy:
    """Pluggable restart policy translated to ``tenacity.AsyncRetrying``.

    Default values mirror tenacity's own defaults so a bare
    ``RestartPolicy()`` is sane.
    """

    attempts: int = 3
    min_wait: float = 1.0
    max_wait: float = 30.0


class BaseSupervisor(ABC):
    """Shared lifecycle scaffolding for supervisors."""

    # Subclasses set this if they want a non-class-name label in status
    # snapshots and log lines.
    name: Optional[str] = None

    # Classvar singleton storage so subclasses can use the uniform
    # `get_instance()` accessor. Each subclass gets its own slot.
    _instance: ClassVar[Optional["BaseSupervisor"]] = None

    def __init__(self) -> None:
        self._lock = anyio.Lock()
        self._started_at: Optional[datetime] = None
        self._last_error: Optional[str] = None
        self._logger = get_logger(self.__class__.__module__)

    # ---- singleton accessor ---------------------------------------------

    @classmethod
    def get_instance(cls, *args, **kwargs) -> "BaseSupervisor":
        """Return the per-subclass singleton, constructing on first call.

        ``*args`` / ``**kwargs`` are forwarded to ``__init__`` and only
        consulted on the first call. Plugins typically wrap this in a
        module-level ``get_xxx_runtime()`` helper so call sites stay tidy.
        """
        if cls._instance is None:
            cls._instance = cls(*args, **kwargs)
        return cls._instance

    @classmethod
    async def reset_instance(cls) -> None:
        """Stop and discard the singleton (useful for tests)."""
        if cls._instance is not None:
            try:
                if cls._instance.is_running():
                    await cls._instance.stop()
            finally:
                cls._instance = None

    # ---- public lifecycle ------------------------------------------------

    @property
    def label(self) -> str:
        return self.name or self.__class__.__name__

    async def start(self) -> None:
        """Idempotent start. Subclass implements ``_do_start``."""
        async with self._lock:
            if self.is_running():
                return
            try:
                await self._do_start()
                self._started_at = datetime.now(timezone.utc)
                self._last_error = None
            except Exception as exc:
                self._last_error = str(exc)
                raise

    async def stop(self) -> None:
        """Idempotent stop. Subclass implements ``_do_stop``."""
        async with self._lock:
            if not self.is_running():
                return
            try:
                await self._do_stop()
            finally:
                self._started_at = None

    async def restart(self, *, policy: Optional[RestartPolicy] = None) -> None:
        """Stop then start. With ``policy``, retries the start with backoff."""
        await self.stop()
        if policy is None:
            await self.start()
            return
        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(policy.attempts),
            wait=wait_random_exponential(min=policy.min_wait, max=policy.max_wait),
            reraise=True,
        ):
            with attempt:
                await self.start()

    def status_snapshot(self) -> dict[str, Any]:
        """Uniform shape for the broadcaster / health endpoints."""
        return {
            "name": self.label,
            "running": self.is_running(),
            "started_at": self._started_at.isoformat() if self._started_at else None,
            "last_error": self._last_error,
            **self._extra_status(),
        }

    # ---- subclass surface ------------------------------------------------

    @abstractmethod
    def is_running(self) -> bool:
        """Return True iff the supervised resource is currently alive."""

    @abstractmethod
    async def _do_start(self) -> None:
        """Subclass spawn / connect logic."""

    @abstractmethod
    async def _do_stop(self) -> None:
        """Subclass teardown logic."""

    async def health_check(self) -> bool:
        """Readiness probe. Default: trust ``is_running()``.

        Subclasses with cheap probes (TCP connect, HTTP /health) should
        override.
        """
        return self.is_running()

    def _extra_status(self) -> dict[str, Any]:
        """Subclass status fields (pid, port, etc.). Empty by default."""
        return {}
