"""Encryption, masking, and persistence for Studio-managed secrets."""

from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.models.provider import ProviderConnection
from backend.models.secret import Secret
from backend.schemas.secret import SecretCreate, SecretRead
from backend.services.errors import (
    ResourceConflictError,
    ResourceNotFoundError,
    ServiceConfigurationError,
)


class SecretService:
    def __init__(self, database: Session) -> None:
        self._database = database

    @staticmethod
    def _cipher() -> Fernet:
        key = settings.encryption_key
        if not key:
            raise ServiceConfigurationError(
                "Secret storage is not configured; set AGENTTREE_STUDIO_ENCRYPTION_KEY",
            )
        try:
            return Fernet(key.encode("utf-8"))
        except (ValueError, TypeError) as exc:
            raise ServiceConfigurationError(
                "AGENTTREE_STUDIO_ENCRYPTION_KEY is not a valid Fernet key",
            ) from exc

    @staticmethod
    def _mask(value: str) -> str:
        if len(value) <= 4:
            return "•" * 8
        prefix = value[:3] if len(value) > 8 else ""
        return f"{prefix}{'•' * 8}{value[-4:]}"

    def _read(self, secret: Secret) -> SecretRead:
        return SecretRead(
            id=secret.id,
            name=secret.name,
            secret_type=secret.secret_type,
            masked_value=self._mask(self._decrypt(secret.encrypted_value)),
            created_at=secret.created_at,
            updated_at=secret.updated_at,
        )

    def _decrypt(self, encrypted_value: str) -> str:
        try:
            return self._cipher().decrypt(encrypted_value.encode("utf-8")).decode("utf-8")
        except (InvalidToken, UnicodeDecodeError) as exc:
            raise ServiceConfigurationError(
                "A stored secret cannot be decrypted with the configured key",
            ) from exc

    def create(self, payload: SecretCreate) -> SecretRead:
        encrypted = self._cipher().encrypt(payload.value.encode("utf-8")).decode("utf-8")
        secret = Secret(
            name=payload.name,
            secret_type=payload.secret_type,
            encrypted_value=encrypted,
        )
        self._database.add(secret)
        self._database.commit()
        self._database.refresh(secret)
        return self._read(secret)

    def list(self) -> list[SecretRead]:
        secrets = self._database.scalars(
            select(Secret).order_by(Secret.created_at.desc()),
        ).all()
        return [self._read(secret) for secret in secrets]

    def reveal(self, secret_id: str) -> str:
        """Return plaintext only to internal provider operations."""
        secret = self._database.get(Secret, secret_id)
        if secret is None:
            raise ResourceNotFoundError("Secret not found")
        return self._decrypt(secret.encrypted_value)

    def delete(self, secret_id: str) -> None:
        secret = self._database.get(Secret, secret_id)
        if secret is None:
            raise ResourceNotFoundError("Secret not found")
        references = self._database.scalar(
            select(func.count()).select_from(ProviderConnection).where(
                ProviderConnection.secret_id == secret_id,
            ),
        )
        if references:
            raise ResourceConflictError(
                "Secret is used by a provider connection and cannot be deleted",
            )
        self._database.delete(secret)
        self._database.commit()
