"""ActionNode — fire-once node (gmail send, httpRequest, whatsappSend).

Inherits :class:`BaseNode` semantics unchanged: validate params,
dispatch op, wrap result. Exists as a distinct class so contract
invariants and the executor can distinguish kinds.
"""

from __future__ import annotations

from typing import ClassVar

from services.plugin.base import BaseNode
from services.plugin.scaling import ACTION_START_TO_CLOSE, TaskQueue


class ActionNode(BaseNode, abstract=True):
    """Base class for fire-once action nodes."""

    component_kind: ClassVar[str] = "generic"
    task_queue: ClassVar[str] = TaskQueue.REST_API
    start_to_close_timeout = ACTION_START_TO_CLOSE
