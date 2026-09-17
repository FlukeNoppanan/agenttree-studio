"""Destination configuration and isolated post-run result delivery."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any, Protocol

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.models.destination import ResultDelivery, ResultDestination
from backend.models.run import Run
from backend.models.secret import Secret
from backend.models.tree import Tree
from backend.repositories.protocols import DestinationRepository
from backend.repositories.sqlalchemy import SQLAlchemyDestinationRepository
from backend.schemas.destination import (
    DeliveryResultRead,
    DestinationRead,
    DestinationTestRead,
    DestinationWrite,
)
from backend.services.errors import ResourceConflictError, ResourceNotFoundError
from backend.services.secret_service import SecretService


class DestinationAdapter(Protocol):
    def deliver(self, destination: ResultDestination, payload: dict[str, Any], credential: str | None) -> None: ...


class BuiltInDestinationAdapter:
    def deliver(self, destination: ResultDestination, payload: dict[str, Any], credential: str | None) -> None:
        del destination, payload, credential


class WebhookDestinationAdapter:
    def __init__(self, client_factory: Callable[..., httpx.Client] = httpx.Client) -> None:
        self._client_factory = client_factory

    def deliver(self, destination: ResultDestination, payload: dict[str, Any], credential: str | None) -> None:
        config = destination.configuration_json or {}
        headers = {str(key): str(value) for key, value in config.get("headers", {}).items()}
        if credential:
            header = str(config.get("secret_header") or "Authorization")
            prefix = str(config.get("secret_prefix") if "secret_prefix" in config else "Bearer ")
            headers[header] = f"{prefix}{credential}"
        with self._client_factory(timeout=float(config.get("timeout_seconds", 10)), follow_redirects=False) as client:
            response = client.post(str(config["url"]), json=payload, headers=headers)
            response.raise_for_status()


class DestinationService:
    DEFAULTS = (
        ("Store in Studio", "store_in_studio"),
        ("Return API Response", "api_response"),
    )

    def __init__(self, database: Session, repository: DestinationRepository | None = None) -> None:
        self._database = database
        self._repository = repository or SQLAlchemyDestinationRepository(database)

    @staticmethod
    def read(destination: ResultDestination) -> DestinationRead:
        return DestinationRead(
            id=destination.id, tree_id=destination.tree_id, name=destination.name,
            destination_type=destination.destination_type, enabled=destination.enabled,
            configuration=destination.configuration_json or {}, secret_id=destination.secret_id,
            created_at=destination.created_at, updated_at=destination.updated_at,
        )

    def ensure_defaults(self, tree_id: str) -> None:
        existing = {item.destination_type for item in self._repository.list_for_tree(tree_id)}
        for name, destination_type in self.DEFAULTS:
            if destination_type not in existing:
                self._repository.add(ResultDestination(
                    tree_id=tree_id, name=name, destination_type=destination_type,
                    enabled=True, configuration_json={},
                ))
        self._database.commit()

    def list(self, tree_id: str) -> list[DestinationRead]:
        if self._database.get(Tree, tree_id) is None:
            raise ResourceNotFoundError("Tree not found")
        self.ensure_defaults(tree_id)
        return [self.read(item) for item in self._repository.list_for_tree(tree_id)]

    def create(self, tree_id: str, payload: DestinationWrite) -> DestinationRead:
        if self._database.get(Tree, tree_id) is None:
            raise ResourceNotFoundError("Tree not found")
        self._validate_secret(payload.secret_id)
        if payload.destination_type.value in {"store_in_studio", "api_response"}:
            existing = self._database.scalar(select(func.count()).select_from(ResultDestination).where(
                ResultDestination.tree_id == tree_id,
                ResultDestination.destination_type == payload.destination_type.value,
            ))
            if existing:
                raise ResourceConflictError("This built-in destination already exists")
        destination = ResultDestination(
            tree_id=tree_id, name=payload.name,
            destination_type=payload.destination_type.value, enabled=payload.enabled,
            configuration_json=payload.configuration, secret_id=payload.secret_id,
        )
        self._repository.add(destination)
        self._database.commit()
        self._database.refresh(destination)
        return self.read(destination)

    def update(self, tree_id: str, destination_id: str, payload: DestinationWrite) -> DestinationRead:
        destination = self._owned(tree_id, destination_id)
        if destination.destination_type in {"store_in_studio", "api_response"} and payload.destination_type.value != destination.destination_type:
            raise ResourceConflictError("Built-in destination type cannot be changed")
        self._validate_secret(payload.secret_id)
        destination.name = payload.name
        destination.destination_type = payload.destination_type.value
        destination.enabled = payload.enabled
        destination.configuration_json = payload.configuration
        destination.secret_id = payload.secret_id
        self._database.commit()
        self._database.refresh(destination)
        return self.read(destination)

    def delete(self, tree_id: str, destination_id: str) -> None:
        destination = self._owned(tree_id, destination_id)
        if destination.destination_type in {"store_in_studio", "api_response"}:
            raise ResourceConflictError("Built-in destinations can be disabled but not deleted")
        self._database.delete(destination)
        self._database.commit()

    def _owned(self, tree_id: str, destination_id: str) -> ResultDestination:
        destination = self._repository.get(destination_id)
        if destination is None or destination.tree_id != tree_id:
            raise ResourceNotFoundError("Destination not found")
        return destination

    def _validate_secret(self, secret_id: str | None) -> None:
        if secret_id and self._database.get(Secret, secret_id) is None:
            raise ResourceNotFoundError("Secret not found")


class ResultDeliveryService:
    def __init__(
        self,
        database: Session,
        repository: DestinationRepository | None = None,
        webhook_adapter: DestinationAdapter | None = None,
    ) -> None:
        self._database = database
        self._repository = repository or SQLAlchemyDestinationRepository(database)
        self._webhook = webhook_adapter or WebhookDestinationAdapter()
        self._built_in = BuiltInDestinationAdapter()

    @staticmethod
    def read(delivery: ResultDelivery) -> DeliveryResultRead:
        return DeliveryResultRead(
            id=delivery.id, run_id=delivery.run_id, destination_id=delivery.destination_id,
            destination_name=delivery.destination_name, destination_type=delivery.destination_type,
            status=delivery.status, attempted_at=delivery.attempted_at,
            completed_at=delivery.completed_at, sanitized_error=delivery.sanitized_error,
        )

    def deliver(self, run: Run, caller_metadata: dict[str, Any]) -> list[DeliveryResultRead]:
        DestinationService(self._database, self._repository).ensure_defaults(run.tree_id)
        payload = {
            "run_id": run.id, "tree_id": run.tree_id, "status": run.status,
            "result": (run.output_json or {}).get("value"), "metadata": caller_metadata,
        }
        results: list[DeliveryResultRead] = []
        for destination in self._repository.list_for_tree(run.tree_id, enabled_only=True):
            delivery = ResultDelivery(
                run_id=run.id, destination_id=destination.id,
                destination_name=destination.name, destination_type=destination.destination_type,
                status="pending", attempted_at=datetime.now(timezone.utc),
            )
            self._repository.add_delivery(delivery)
            self._database.commit()
            try:
                credential = SecretService(self._database).reveal(destination.secret_id) if destination.secret_id else None
                adapter = self._webhook if destination.destination_type == "webhook" else self._built_in
                adapter.deliver(destination, payload, credential)
                delivery.status = "success"
            except Exception:
                delivery.status = "failed"
                delivery.sanitized_error = "Webhook delivery failed" if destination.destination_type == "webhook" else "Destination delivery failed"
            delivery.completed_at = datetime.now(timezone.utc)
            self._database.commit()
            results.append(self.read(delivery))
        return results

    def test(self, destination: ResultDestination) -> DestinationTestRead:
        if destination.destination_type != "webhook":
            return DestinationTestRead(success=True, message="Built-in destination is available")
        payload = {
            "event": "agenttree_studio.destination_test",
            "destination_id": destination.id,
            "message": "This is a safe test payload. No Tree Run was executed.",
        }
        try:
            credential = SecretService(self._database).reveal(destination.secret_id) if destination.secret_id else None
            self._webhook.deliver(destination, payload, credential)
            return DestinationTestRead(success=True, message="Test payload delivered")
        except Exception:
            return DestinationTestRead(success=False, message="Webhook destination test failed")
