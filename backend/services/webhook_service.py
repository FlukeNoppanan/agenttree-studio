"""Verify incoming integration credentials and submit through the normal Run path."""

from secrets import compare_digest, token_urlsafe
import json

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from backend.api.public_v1 import accessible_tree, ready
from backend.api.public_v2 import links
from backend.core.public_api import PublicAPIError
from backend.core.sanitization import sanitize_value
from backend.models.auth import User
from backend.models.webhook import WebhookIntegration
from backend.schemas.public_api_v2 import RunAccepted
from backend.schemas.run import InvocationRequest
from backend.schemas.webhook import WebhookCreated, WebhookEvent, WebhookRead
from backend.services.async_runs import RuntimeCapacityError, get_async_run_coordinator
from backend.services.auth_service import AuthService, digest, now
from backend.services.run_service import RunService


class WebhookService:
    def __init__(self, database: Session):
        self.db = database

    def managed_tree(self, user: User, tree_id: str):
        # Middleware requires manage_trees_agents; use access is checked currently too.
        return accessible_tree(self.db, user, tree_id)

    def list(self, user: User, tree_id: str) -> list[WebhookRead]:
        self.managed_tree(user, tree_id)
        query = select(WebhookIntegration).where(WebhookIntegration.tree_id == tree_id)
        if not user.is_admin:
            query = query.where(WebhookIntegration.owner_user_id == user.id)
        return [WebhookRead.model_validate(item) for item in self.db.scalars(query.order_by(WebhookIntegration.created_at))]

    def owned(self, user: User, tree_id: str, webhook_id: str) -> WebhookIntegration:
        self.managed_tree(user, tree_id)
        item = self.db.scalar(select(WebhookIntegration).where(
            WebhookIntegration.id == webhook_id, WebhookIntegration.tree_id == tree_id,
        ).with_for_update())
        if item is None or (not user.is_admin and item.owner_user_id != user.id):
            raise HTTPException(404, "Webhook is not available")
        return item

    def reveal_new(self, item: WebhookIntegration, user: User, action: str) -> WebhookCreated:
        raw = "athw_" + token_urlsafe(48)
        item.secret_hash = digest(raw)
        AuthService(self.db).event(action, user, user)
        self.db.commit()
        return WebhookCreated(**WebhookRead.model_validate(item).model_dump(), secret=raw)

    def create(self, user: User, tree_id: str, name: str) -> WebhookCreated:
        tree = self.managed_tree(user, tree_id)
        if not ready(tree):
            raise HTTPException(409, "Tree is not ready")
        item = WebhookIntegration(tree_id=tree_id, owner_user_id=user.id, name=name, secret_hash="")
        self.db.add(item)
        return self.reveal_new(item, user, "webhook.created")

    def authenticate(self, webhook_id: str, authorization: str) -> tuple[WebhookIntegration, User, str]:
        raw = authorization[7:] if authorization.startswith("Bearer athw_") and len(authorization) <= 128 else ""
        item = self.db.scalar(select(WebhookIntegration).where(WebhookIntegration.id == webhook_id).with_for_update())
        valid = compare_digest(digest(raw), item.secret_hash if item else "0" * 64)
        owner = self.db.get(User, item.owner_user_id) if item else None
        if (not raw or not valid or not item or not item.enabled or not owner
                or not owner.is_active or owner.must_change_password
                or not AuthService(self.db).can_use_tree(owner, item.tree_id)):
            raise PublicAPIError(404, "webhook_not_available", "Webhook is not available.")
        return item, owner, raw

    def submit(self, webhook_id: str, authorization: str, payload: WebhookEvent) -> RunAccepted:
        item, owner, raw = self.authenticate(webhook_id, authorization)
        tree = accessible_tree(self.db, owner, item.tree_id)
        if not ready(tree):
            raise PublicAPIError(409, "tree_not_ready", "The requested Tree is not ready.")
        # Never persist ingress headers; scrub the credential even if echoed in the event.
        cleaned = json.loads(json.dumps(payload.model_dump(), ensure_ascii=False).replace(raw, "[REDACTED]"))
        event = sanitize_value(cleaned["event"])
        metadata = sanitize_value(cleaned["metadata"])
        metadata["webhook_integration_id"] = item.id
        item.last_received_at = now()
        run = RunService(self.db).prepare(tree.id, InvocationRequest(
            input={"event": event}, metadata=metadata, execution_mode=payload.execution_mode,
        ), invocation_source="webhook_ingress", submitted_by_user_id=owner.id)
        factory = sessionmaker(bind=self.db.get_bind(), autoflush=False, expire_on_commit=False)
        try:
            get_async_run_coordinator().submit(factory, run.id)
        except RuntimeCapacityError:
            self.db.delete(run)
            self.db.commit()
            raise PublicAPIError(503, "runtime_capacity", "Run capacity is temporarily exhausted.") from None
        return RunAccepted(execution_mode=payload.execution_mode, run_id=run.id, tree_id=run.tree_id, tree_version_id=run.tree_version_id,
                           status="queued", created_at=RunService._utc(run.created_at), links=links(run.id))
