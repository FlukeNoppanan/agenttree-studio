"""Static local-development settings for the initial Studio foundation."""

from dataclasses import dataclass, field
import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    app_name: str = "AgentTree Studio API"
    app_version: str = "0.1.0"
    database_url: str = field(default_factory=lambda: (
        os.getenv("AGENTTREE_STUDIO_DATABASE_URL")
        or f"sqlite:///{PROJECT_ROOT / 'agenttree_studio.db'}"
    ))
    cors_origins: tuple[str, ...] = (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    )

    @property
    def encryption_key(self) -> str | None:
        """Read the secret key at use time so deployments can inject it safely."""
        return os.getenv("AGENTTREE_STUDIO_ENCRYPTION_KEY")


settings = Settings()
