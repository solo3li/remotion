"""Contract tests for workflow node handlers.

Each test file in this package exercises one category of nodes through the
NodeTestHarness, mocking external dependencies (httpx, SDKs, subprocesses)
to lock down the handler's input -> output contract.
"""
