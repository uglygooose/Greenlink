from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class AppError(Exception):
    code: str
    message: str
    status_code: int = 400


class AuthenticationError(AppError):
    def __init__(self, message: str = "Authentication failed") -> None:
        super().__init__(code="authentication_failed", message=message, status_code=401)


class AuthorizationError(AppError):
    def __init__(self, message: str = "Access denied") -> None:
        super().__init__(code="access_denied", message=message, status_code=403)


class ConflictError(AppError):
    def __init__(self, message: str, code: str = "conflict") -> None:
        super().__init__(code=code, message=message, status_code=409)


class NotFoundError(AppError):
    def __init__(self, message: str = "Resource not found") -> None:
        super().__init__(code="not_found", message=message, status_code=404)
