"""Provider-neutral model discovery contract."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


class ProviderDiscoveryError(Exception):
    """A safe provider error that never includes credential-bearing responses."""

    def __init__(self, message: str, *, diagnostic: str | None = None) -> None:
        super().__init__(message)
        # Diagnostics are deliberately limited to fixed, non-sensitive labels.
        # The raw HTTP/SDK exception can contain URLs, headers, or response bodies.
        self.diagnostic = diagnostic


@dataclass(frozen=True)
class DiscoveredModel:
    model_id: str
    display_name: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    generation_candidate: bool = True


class ProviderAdapter(ABC):
    """Test a connection and enumerate models without performing generation."""

    @abstractmethod
    def discover_models(self, credential: str | None) -> tuple[DiscoveredModel, ...]:
        raise NotImplementedError

    def test_connection(self, credential: str | None) -> None:
        self.discover_models(credential)
