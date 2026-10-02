"""Middleware package for FastAPI application."""

from middleware.auth import AuthMiddleware

__all__ = ["AuthMiddleware"]
