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
    def public_api_cors_origins(self) -> tuple[str, ...]:
        return tuple(origin.strip().rstrip("/") for origin in os.getenv(
            "AGENTTREE_PUBLIC_API_CORS_ORIGINS", "",
        ).split(",") if origin.strip() and origin.strip() != "*")

    @property
    def encryption_key(self) -> str | None:
        """Read the secret key at use time so deployments can inject it safely."""
        return os.getenv("AGENTTREE_STUDIO_ENCRYPTION_KEY")

    @property
    def artifact_store_root(self) -> Path:
        return Path(os.getenv(
            "AGENTTREE_STUDIO_ARTIFACT_ROOT",
            str(PROJECT_ROOT / "data" / "artifacts"),
        )).resolve()

    @property
    def max_artifact_bytes(self) -> int:
        return int(os.getenv("AGENTTREE_STUDIO_MAX_ARTIFACT_BYTES", "10485760"))


settings = Settings()
