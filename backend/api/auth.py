"""Cookie session, self-service account and Admin user-management endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
import os
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, select

from backend.db.session import get_db
from backend.models.auth import SecurityEvent, User, UserSession
from backend.schemas.auth import (
    AccountRead, ChangePasswordRequest, CreateUserRequest, LoginRequest, ResetPasswordRequest,
    SecurityEventPage, SecurityEventRead, TokenCreateRequest, TokenCreated, TokenRead, UpdateUserRequest, UserRead,
)
from backend.schemas.tree import TreeListRead
from backend.services.auth_service import AuthService, COOKIE_NAME, SESSION_SECONDS
from backend.services.tree_service import TreeService

router = APIRouter(tags=["authentication"])


@router.get("/auth/integration-config")
def integration_config() -> dict:
    from backend.core.config import settings
    # Browser origin is the fallback, never an internal proxy target or forwarded Host.
    return {"public_origin": settings.public_origin}


def current_user(request: Request, database: Session) -> User:
    user_id = getattr(request.state, "user_id", None)
    user = database.get(User, user_id) if user_id else None
    if not user or not user.is_active:
        raise HTTPException(401, "Authentication required")
    return user


@router.post("/auth/login", response_model=UserRead)
def login(payload: LoginRequest, request: Request, response: Response, database: Session = Depends(get_db)) -> UserRead:
    user, raw = AuthService(database).login(payload.username, payload.password, request.client.host if request.client else "unknown")
    response.set_cookie(COOKIE_NAME, raw, max_age=SESSION_SECONDS, httponly=True,
                        secure=request.url.scheme == "https" or os.getenv("AGENTTREE_STUDIO_SECURE_COOKIES", "").lower() == "true", samesite="lax", path="/")
    return AuthService.read(user)


@router.get("/auth/me", response_model=UserRead)
def me(request: Request, database: Session = Depends(get_db)) -> UserRead:
    return AuthService.read(current_user(request, database))


@router.get("/auth/account", response_model=AccountRead)
def account(request: Request, database: Session = Depends(get_db)) -> AccountRead:
    user = current_user(request, database)
    session_id = getattr(request.state, "session_id", None)
    session = database.get(UserSession, session_id) if session_id else None
    return AuthService(database).account(user, session)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, database: Session = Depends(get_db)) -> None:
    user = current_user(request, database)
    session_id = getattr(request.state, "session_id", None)
    session = database.get(UserSession, session_id) if session_id else None
    if session:
        AuthService(database).logout(session, user)
    response.delete_cookie(COOKIE_NAME, path="/")


@router.post("/auth/change-password", response_model=UserRead)
def change_password(payload: ChangePasswordRequest, request: Request, database: Session = Depends(get_db)) -> UserRead:
    user = current_user(request, database)
    session_id = getattr(request.state, "session_id", None)
    session = database.get(UserSession, session_id) if session_id else None
    if not session:
        raise HTTPException(401, "Cookie session required")
    AuthService(database).change_password(user, payload.current_password, payload.new_password, session)
    return AuthService.read(user)


@router.get("/users", response_model=list[UserRead])
def list_users(database: Session = Depends(get_db)) -> list[UserRead]:
    return AuthService(database).list_users()


@router.get("/security-events", response_model=SecurityEventPage)
def list_security_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    event_type: str | None = Query(None, max_length=80),
    actor: str | None = Query(None, max_length=160),
    search: str | None = Query(None, max_length=160),
    after: datetime | None = None,
    before: datetime | None = None,
    database: Session = Depends(get_db),
) -> SecurityEventPage:
    """Admin-only, server-filtered audit metadata; no credential fields."""
    if after and after.tzinfo is None:
        after = after.replace(tzinfo=timezone.utc)
    if before and before.tzinfo is None:
        before = before.replace(tzinfo=timezone.utc)
    if after and before and after > before:
        raise HTTPException(422, "Start time must be before end time")
    filters = []
    if event_type:
        filters.append(SecurityEvent.event_type == event_type)
    if actor:
        filters.append(User.username.ilike(f"%{actor.strip()}%"))
    if after:
        filters.append(SecurityEvent.created_at >= after)
    if before:
        filters.append(SecurityEvent.created_at <= before)
    if search and search.strip():
        term = f"%{search.strip()}%"
        filters.append(or_(SecurityEvent.event_type.ilike(term), User.username.ilike(term),
                           SecurityEvent.subject_user_id.ilike(term)))
    base = select(SecurityEvent).outerjoin(User, SecurityEvent.actor_user_id == User.id).where(*filters)
    total = database.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = database.execute(
        select(SecurityEvent, User.username)
        .outerjoin(User, SecurityEvent.actor_user_id == User.id)
        .where(*filters)
        .order_by(SecurityEvent.created_at.desc(), SecurityEvent.id.desc())
        .offset((page - 1) * page_size).limit(page_size)
    ).all()
    event_types = list(database.scalars(select(SecurityEvent.event_type).distinct().order_by(SecurityEvent.event_type)))
    return SecurityEventPage(
        items=[SecurityEventRead(id=event.id, event_type=event.event_type,
                                 actor_username=username, subject_user_id=event.subject_user_id,
                                 created_at=event.created_at) for event, username in rows],
        total=total, page=page, page_size=page_size, event_types=event_types,
    )


@router.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(payload: CreateUserRequest, request: Request, database: Session = Depends(get_db)) -> UserRead:
    return AuthService(database).create_user(payload, current_user(request, database))


@router.put("/users/{user_id}", response_model=UserRead)
def update_user(user_id: str, payload: UpdateUserRequest, request: Request, database: Session = Depends(get_db)) -> UserRead:
    return AuthService(database).update_user(user_id, payload, current_user(request, database))


@router.post("/users/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(user_id: str, payload: ResetPasswordRequest, request: Request, database: Session = Depends(get_db)) -> None:
    AuthService(database).reset_password(user_id, payload.password, current_user(request, database))


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: str, request: Request, database: Session = Depends(get_db)) -> None:
    AuthService(database).delete_user(user_id, current_user(request, database))


@router.get("/me/trees", response_model=list[TreeListRead])
def my_trees(request: Request, database: Session = Depends(get_db)) -> list[TreeListRead]:
    user = current_user(request, database)
    service = TreeService(database)
    allowed = {tree.id for tree in AuthService(database).my_trees(user)}
    return [tree for tree in service.list() if tree.id in allowed]


@router.get("/auth/tokens", response_model=list[TokenRead])
def list_tokens(request: Request, database: Session = Depends(get_db)) -> list[TokenRead]:
    return AuthService(database).list_tokens(current_user(request, database))


@router.post("/auth/tokens", response_model=TokenCreated, status_code=status.HTTP_201_CREATED)
def create_token(payload: TokenCreateRequest, request: Request, database: Session = Depends(get_db)) -> TokenCreated:
    return AuthService(database).create_token(current_user(request, database), payload.name)


@router.delete("/auth/tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_token(token_id: str, request: Request, database: Session = Depends(get_db)) -> None:
    AuthService(database).revoke_token(current_user(request, database), token_id)
