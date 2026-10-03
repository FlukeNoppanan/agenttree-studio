"""Cookie-managed integrations and separately authenticated event ingress."""

import json

from fastapi import APIRouter, Depends, Request, Response
from pydantic import ValidationError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from backend.api.auth import current_user
from backend.core.public_api import PublicAPIError, rate_limited
from backend.db.session import get_db
from backend.schemas.public_api_v2 import RunAccepted
from backend.schemas.webhook import WebhookCreate, WebhookCreated, WebhookEvent, WebhookRead, WebhookUpdate
from backend.services.auth_service import AuthService
from backend.services.webhook_service import WebhookService

router = APIRouter(tags=["Webhook ingress"])
MAX_BODY = 65_536


def finite_json(_: str):
    raise ValueError("Nonfinite numbers are not JSON")


def bounded_depth(value):
    pending = [(value, 0)]
    while pending:
        node, depth = pending.pop()
        if depth > 32:
            raise ValueError("Event nesting is too deep")
        if isinstance(node, dict):
            pending.extend((item, depth + 1) for item in node.values())
        elif isinstance(node, list):
            pending.extend((item, depth + 1) for item in node)


@router.get("/trees/{tree_id}/webhooks", response_model=list[WebhookRead])
def list_webhooks(tree_id: str, request: Request, database: Session = Depends(get_db)):
    return WebhookService(database).list(current_user(request, database), tree_id)


@router.post("/trees/{tree_id}/webhooks", response_model=WebhookCreated, status_code=201)
def create_webhook(tree_id: str, payload: WebhookCreate, request: Request, database: Session = Depends(get_db)):
    return WebhookService(database).create(current_user(request, database), tree_id, payload.name)


@router.patch("/trees/{tree_id}/webhooks/{webhook_id}", response_model=WebhookRead)
def update_webhook(tree_id: str, webhook_id: str, payload: WebhookUpdate, request: Request, database: Session = Depends(get_db)):
    user = current_user(request, database)
    item = WebhookService(database).owned(user, tree_id, webhook_id)
    item.enabled = payload.enabled
    AuthService(database).event("webhook.enabled" if payload.enabled else "webhook.disabled", user, user)
    database.commit()
    return WebhookRead.model_validate(item)


@router.post("/trees/{tree_id}/webhooks/{webhook_id}/rotate", response_model=WebhookCreated)
def rotate_webhook(tree_id: str, webhook_id: str, request: Request, database: Session = Depends(get_db)):
    user = current_user(request, database)
    service = WebhookService(database)
    return service.reveal_new(service.owned(user, tree_id, webhook_id), user, "webhook.rotated")


@router.delete("/trees/{tree_id}/webhooks/{webhook_id}", status_code=204)
def delete_webhook(tree_id: str, webhook_id: str, request: Request, database: Session = Depends(get_db)):
    user = current_user(request, database)
    database.delete(WebhookService(database).owned(user, tree_id, webhook_id))
    AuthService(database).event("webhook.deleted", user, user)
    database.commit()
    return Response(status_code=204)


@router.post("/webhooks/{webhook_id}", status_code=202, response_model=RunAccepted)
async def receive_webhook(webhook_id: str, request: Request, database: Session = Depends(get_db)):
    authorization = request.headers.get("authorization", "")
    service = WebhookService(database)

    def verify():
        try:
            service.authenticate(webhook_id, authorization)
        finally:
            database.rollback()

    await run_in_threadpool(verify)
    if rate_limited("webhook_submit", webhook_id, limit=30):
        raise PublicAPIError(429, "rate_limited", "Too many requests.")
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
        raise PublicAPIError(415, "unsupported_media_type", "An application/json event is required.")
    # Read incrementally; do not trust Content-Length or buffer an unbounded event.
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_BODY:
            raise PublicAPIError(413, "payload_too_large", "Webhook payload exceeds 65536 bytes.")
    try:
        decoded = json.loads(body, parse_constant=finite_json)
        bounded_depth(decoded)
        payload = WebhookEvent.model_validate(decoded)
    except (ValueError, ValidationError, RecursionError):
        raise PublicAPIError(422, "validation_error", "A valid event object and optional metadata object are required.") from None
    return await run_in_threadpool(service.submit, webhook_id, authorization, payload)
