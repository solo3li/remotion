"""Per-node input parameter schema registry.

Single source of truth: the plugin `Params` classes in ``server/nodes/``.
Each plugin's ``BaseNode.__init_subclass__`` hook calls
``services.node_registry.register_node`` at import time, which writes the
plugin class's ``Params`` into ``_DIRECT_MODELS`` here. Plugin discovery
happens in ``server/nodes/__init__.py`` via ``pkgutil.walk_packages``.

No class is pre-seeded from ``models/nodes.py``. If a node type is
requested but no plugin registered its Params, ``get_node_input_schema``
returns None and logs a warning — the plugin module failed to import or
the plugin class forgot to set ``Params = X``.
"""

from typing import Any, Optional

from pydantic import BaseModel

from core.logging import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Type → Pydantic model registry
# ---------------------------------------------------------------------------
# Populated at runtime by plugin ``BaseNode.__init_subclass__`` via
# ``services.node_registry.register_node``. Starts empty on module import.

_DIRECT_MODELS: dict[str, type[BaseModel]] = {}


# Alias kept for readability in downstream callers that predate the
# plugin migration. They're identical objects now.
NODE_INPUT_MODELS: dict[str, type[BaseModel]] = _DIRECT_MODELS


# ---------------------------------------------------------------------------
# Lookup + post-processing
# ---------------------------------------------------------------------------


_schema_cache: dict[str, dict[str, Any]] = {}


def get_node_input_schema(node_type: str) -> Optional[dict[str, Any]]:
    """Return the JSON Schema 7 document for a node's input parameters,
    or None if no plugin registered a Params class for this type.
    Cached per-process; ``services.node_registry.register_node`` pops
    the entry on re-registration so plugin hot-reload refreshes the
    served schema."""

    if node_type in _schema_cache:
        return _schema_cache[node_type]
    model = NODE_INPUT_MODELS.get(node_type)
    if model is None:
        logger.warning(
            "No plugin Params registered for node type %r. "
            "Did the plugin module fail to import, or is ``Params = X`` "
            "missing on the node class? Check server/nodes/<category>/<name>.py.",
            node_type,
        )
        return None
    schema = _post_process(model.model_json_schema(), node_type)
    _schema_cache[node_type] = schema
    return schema


def list_node_types_with_input_schema() -> list[str]:
    """Stable alphabetised list of types with declared input schemas."""

    return sorted(NODE_INPUT_MODELS.keys())


def _post_process(schema: dict[str, Any], node_type: str) -> dict[str, Any]:
    """Strip the discriminator field from the surface schema and lift
    nested ``$defs`` references inline so the editor doesn't have to
    resolve them. The discriminator (``type``) is implicit at the
    transport layer (URL path) and shouldn't render as a parameter.

    Plugin Params extend ``BaseModel`` directly (no ``type: Literal[...]``)
    so for plugin-sourced schemas this strip is a no-op; the lines stay
    for any legacy classes still routed through here during migration.
    """

    cleaned = dict(schema)
    props = dict(cleaned.get("properties") or {})
    props.pop("type", None)
    cleaned["properties"] = props
    required = [r for r in (cleaned.get("required") or []) if r != "type"]
    if required:
        cleaned["required"] = required
    elif "required" in cleaned:
        del cleaned["required"]
    cleaned["title"] = node_type
    return cleaned
