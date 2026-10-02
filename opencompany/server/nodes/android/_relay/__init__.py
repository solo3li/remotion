"""
Android Services Relay Module

Modular WebSocket client for Android device communication using JSON-RPC 2.0 protocol.

Connection: wss://<relay-server>/ws?client_type=web&api_key=<your-api-key>

Components:
- client.py: RelayWebSocketClient class
- protocol.py: JSON-RPC 2.0 message handling
- manager.py: Global client instance management
- broadcaster.py: Status broadcasting to frontend
"""

from .client import RelayWebSocketClient
from .manager import (
    get_relay_client,
    close_relay_client,
    get_current_relay_client,
)

__all__ = [
    "RelayWebSocketClient",
    "get_relay_client",
    "close_relay_client",
    "get_current_relay_client",
]
