"""Common base classes for supervised binaries and sidecars.

Use :class:`BaseProcessSupervisor` for services that own a child process
and :class:`BaseClientSupervisor` for HTTP-only or in-process-task
services. Both inherit from :class:`BaseSupervisor` which provides the
uniform start/stop/status surface.

See ``docs-internal/supervisor.md`` (TBD) for the migration guide.
"""

from .base import BaseSupervisor, RestartPolicy
from .client import BaseClientSupervisor
from .process import BaseProcessSupervisor
from .registry import (
    get_supervisor,
    list_supervisors,
    register_supervisor,
    shutdown_all_supervisors,
    status_snapshot_all,
)
from .util import drain_stream, kill_tree, terminate_then_kill

__all__ = [
    "BaseSupervisor",
    "BaseProcessSupervisor",
    "BaseClientSupervisor",
    "RestartPolicy",
    "drain_stream",
    "kill_tree",
    "terminate_then_kill",
    "register_supervisor",
    "get_supervisor",
    "list_supervisors",
    "shutdown_all_supervisors",
    "status_snapshot_all",
]
