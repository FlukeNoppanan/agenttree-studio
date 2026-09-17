"""Validated decisions and conservative limits for autonomous Specialist Tools."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Mapping

from pydantic import BaseModel, ConfigDict, Field, model_validator


DEFAULT_MAX_TOOL_ITERATIONS = 5
DEFAULT_MAX_TOOL_CALLS = 5
DEFAULT_TOOL_LOOP_TIMEOUT_SECONDS = 60.0
MAX_TOOL_ITERATIONS = 10
MAX_TOOL_CALLS = 10
MAX_TOOL_LOOP_TIMEOUT_SECONDS = 300.0


class ToolDecision(BaseModel):
    """One provider decision in the bounded Specialist Tool loop."""

    model_config = ConfigDict(extra="forbid")

    action: Literal["tool_call", "final"]
    tool_name: str | None = Field(default=None, max_length=300)
    arguments: dict[str, Any] | None = None
    result: Any = None
    reason: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_action_fields(self) -> "ToolDecision":
        if self.action == "tool_call":
            if not self.tool_name or not self.tool_name.strip():
                raise ValueError("tool_call requires tool_name")
            if self.arguments is None:
                raise ValueError("tool_call requires arguments")
            if self.result is not None:
                raise ValueError("tool_call cannot include result")
            self.tool_name = self.tool_name.strip()
        else:
            if self.result is None:
                raise ValueError("final requires result")
            if self.tool_name is not None or self.arguments is not None:
                raise ValueError("final cannot include tool_name or arguments")
        return self


@dataclass(frozen=True)
class ToolLoopSettings:
    """Normalized per-Specialist Tool-loop configuration."""

    enabled: bool = False
    max_iterations: int = DEFAULT_MAX_TOOL_ITERATIONS
    max_tool_calls: int = DEFAULT_MAX_TOOL_CALLS
    timeout_seconds: float = DEFAULT_TOOL_LOOP_TIMEOUT_SECONDS

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any] | None) -> "ToolLoopSettings":
        settings = dict(value or {})
        enabled = settings.get("autonomous_tool_use", False)
        iterations = settings.get("max_tool_iterations", DEFAULT_MAX_TOOL_ITERATIONS)
        calls = settings.get("max_tool_calls", DEFAULT_MAX_TOOL_CALLS)
        timeout = settings.get("tool_loop_timeout_seconds", DEFAULT_TOOL_LOOP_TIMEOUT_SECONDS)
        if not isinstance(enabled, bool):
            raise ValueError("autonomous_tool_use must be a boolean")
        if isinstance(iterations, bool) or not isinstance(iterations, int) or not 1 <= iterations <= MAX_TOOL_ITERATIONS:
            raise ValueError(f"max_tool_iterations must be between 1 and {MAX_TOOL_ITERATIONS}")
        if isinstance(calls, bool) or not isinstance(calls, int) or not 1 <= calls <= MAX_TOOL_CALLS:
            raise ValueError(f"max_tool_calls must be between 1 and {MAX_TOOL_CALLS}")
        if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or not 1 <= timeout <= MAX_TOOL_LOOP_TIMEOUT_SECONDS:
            raise ValueError(
                f"tool_loop_timeout_seconds must be between 1 and {int(MAX_TOOL_LOOP_TIMEOUT_SECONDS)}",
            )
        return cls(
            enabled=enabled,
            max_iterations=iterations,
            max_tool_calls=calls,
            timeout_seconds=float(timeout),
        )
