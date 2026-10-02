"""EventSource abstract base — every external event-producer plugs in here.

Three concrete subclasses cover the four execution modalities documented
in Apache Camel EIP and matched by n8n's trigger model:

    PushEventSource       HTTP webhooks, server-sent events, RPC pushes
    PollingEventSource    interval-based pull (Gmail/Twitter/IMAP polling)
    DaemonEventSource     long-lived subprocess or SDK loop (Stripe CLI,
                          Telegram bot, WhatsApp Go RPC)

Cron / scheduled events stay on APScheduler — they don't need this base.
Internal (in-process) events go through ``event_waiter.dispatch`` directly.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, AsyncIterator, ClassVar, Dict, Optional, Type

from core.logging import get_logger

logger = get_logger(__name__)


class EventSource(ABC):
    """Base — subclasses declare ``type``, optionally ``credential``,
    and implement :meth:`emit` (or one of the convenience hooks on the
    concrete subclasses)."""

    type: ClassVar[str] = ""
    credential: ClassVar[Optional[Type]] = None

    def __init__(self) -> None:
        self._stopped = False
        self._started = False

    async def start(self) -> Dict[str, Any]:
        """Activate the source. Idempotent. Concrete subclasses override
        with their actual lifecycle (subprocess spawn, polling task launch,
        webhook registration)."""
        self._started = True
        self._stopped = False
        return {"success": True, "type": self.type}

    async def stop(self) -> Dict[str, Any]:
        """Deactivate. Idempotent."""
        self._stopped = True
        self._started = False
        return {"success": True, "type": self.type}

    async def status(self) -> Dict[str, Any]:
        """Snapshot for the credentials modal / status broadcaster."""
        return {"type": self.type, "running": self._started}

    @abstractmethod
    def emit(self) -> AsyncIterator:
        """Async iterator yielding ``WorkflowEvent`` instances.

        Returning an iterator (not awaiting it) lets the framework
        manage cancellation and back-pressure uniformly across push,
        polling, and daemon sources.
        """
        raise NotImplementedError
