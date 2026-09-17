"""Credential-safe JSON normalization shared by Runs and Tool operations."""

from datetime import datetime
from enum import Enum
import re
from typing import Any


_AUTHORIZATION = re.compile(r"(?i)(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,;}]+")
_URL_CREDENTIALS = re.compile(r"(https?://)[^/@\s:]+:[^/@\s]+@", re.IGNORECASE)
_SENSITIVE_KEYS = {
    "authorization", "cookie", "password", "secret", "token", "api_key", "api-key",
    "x-api-key", "access_token", "refresh_token",
}


def sanitize_value(value: Any, sensitive_values: tuple[str, ...] = ()) -> Any:
    if isinstance(value, Enum):
        return value.value
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str):
        cleaned = value
        for secret in sensitive_values:
            if secret:
                cleaned = cleaned.replace(secret, "[REDACTED]")
        cleaned = _AUTHORIZATION.sub(r"\1[REDACTED]", cleaned)
        return _URL_CREDENTIALS.sub(r"\1[REDACTED]@", cleaned)
    if isinstance(value, dict):
        return {
            str(key): (
                item if isinstance(item, str) and "{{secret}}" in item else "[REDACTED]"
            ) if str(key).casefold() in _SENSITIVE_KEYS else sanitize_value(item, sensitive_values)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple, set, frozenset)):
        return [sanitize_value(item, sensitive_values) for item in value]
    if hasattr(value, "to_dict"):
        return sanitize_value(value.to_dict(), sensitive_values)
    return sanitize_value(str(value), sensitive_values)
