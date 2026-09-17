"""Provider-neutral model discovery contract."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


class ProviderDiscoveryError(Exception):
    """A safe provider error that never includes credential-bearing responses."""


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
