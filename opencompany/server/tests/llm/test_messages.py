"""Test message filtering used before sending to provider APIs."""

from services.llm.messages import filter_empty_messages
from services.llm.protocol import Message, ToolCall


def test_keeps_non_empty_messages():
    msgs = [
        Message(role="user", content="hi"),
        Message(role="assistant", content="hello"),
    ]
    assert len(filter_empty_messages(msgs)) == 2


def test_removes_empty_user_message():
    msgs = [
        Message(role="user", content=""),
        Message(role="assistant", content="hello"),
    ]
    result = filter_empty_messages(msgs)
    assert len(result) == 1


def test_keeps_tool_messages_even_if_empty():
    msgs = [Message(role="tool", content="", tool_call_id="1")]
    assert len(filter_empty_messages(msgs)) == 1


def test_keeps_assistant_with_tool_calls():
    tc = ToolCall(id="1", name="calc", args={})
    msgs = [Message(role="assistant", content="", tool_calls=[tc])]
    assert len(filter_empty_messages(msgs)) == 1


def test_removes_empty_assistant_without_tool_calls():
    msgs = [Message(role="assistant", content="")]
    assert len(filter_empty_messages(msgs)) == 0
