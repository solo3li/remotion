"""Execution engine package.

Industry-standard workflow execution with:
- Conductor-style decide pattern
- Prefect-style task caching and transactions
- Redis persistence for crash recovery
- Parallel node execution with asyncio.gather
- Runtime conditional branching
"""

from .models import (
    TaskStatus,
    WorkflowStatus,
    ExecutionContext,
    NodeExecution,
    RetryPolicy,
    DLQEntry,
    hash_inputs,
    generate_cache_key,
    get_retry_policy,
    DEFAULT_RETRY_POLICIES,
)
from .executor import WorkflowExecutor
from .cache import ExecutionCache
from .recovery import (
    RecoverySweeper,
    get_recovery_sweeper,
    set_recovery_sweeper,
)
from .conditions import (
    evaluate_condition,
    evaluate_conditions,
    decide_next_edges,
    get_nested_value,
    get_available_operators,
    OPERATORS,
)
from .dlq import (
    DLQHandler,
    NullDLQHandler,
    DLQHandlerProtocol,
    create_dlq_handler,
)

__all__ = [
    # Models
    "TaskStatus",
    "WorkflowStatus",
    "ExecutionContext",
    "NodeExecution",
    "RetryPolicy",
    "DLQEntry",
    "hash_inputs",
    "generate_cache_key",
    "get_retry_policy",
    "DEFAULT_RETRY_POLICIES",
    # Executor
    "WorkflowExecutor",
    # Cache
    "ExecutionCache",
    # Recovery
    "RecoverySweeper",
    "get_recovery_sweeper",
    "set_recovery_sweeper",
    # Conditions
    "evaluate_condition",
    "evaluate_conditions",
    "decide_next_edges",
    "get_nested_value",
    "get_available_operators",
    "OPERATORS",
    # DLQ
    "DLQHandler",
    "NullDLQHandler",
    "DLQHandlerProtocol",
    "create_dlq_handler",
]
