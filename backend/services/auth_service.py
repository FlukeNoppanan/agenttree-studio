"""Identity, password, session, permission and Tree-grant operations."""

from datetime import datetime, timedelta, timezone
from hashlib import sha256
from secrets import token_urlsafe
from threading import Lock
from time import monotonic

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerifyMismatchError, VerificationError
from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from backend.models.auth import ApiToken, SecurityEvent, User, UserPermission, UserSession, UserTreeAccess
from backend.models.provider import ProviderConnection
from backend.models.secret import Secret
from backend.models.tool import ToolConnection
from backend.models.tree import Tree
from backend.schemas.auth import AccountRead, AccountTree, CreateUserRequest, TokenCreated, TokenRead, UpdateUserRequest, UserRead

PERMISSIONS = frozenset({
    "manage_trees_agents", "manage_secrets", "manage_providers_models",
    "manage_tools_mcp", "view_executions", "use_trees",
})
SESSION_SECONDS = 12 * 60 * 60
COOKIE_NAME = "studio_session"
HASHER = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1, hash_len=32, salt_len=16, type=Type.ID)
_DUMMY_HASH = HASHER.hash("dummy-password-that-is-not-an-account")
_attempts: dict[tuple[str, str], tuple[int, float]] = {}
_attempt_lock = Lock()


def now() -> datetime:
    return datetime.now(timezone.utc)


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def digest(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


def validate_password(password: str) -> None:
    if len(password) < 12 or len(password) > 1024:
        raise HTTPException(422, "Password must be 12–1024 characters")


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return HASHER.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def _attempt_key(ip: str, username: str) -> tuple[str, str]:
    # The Vite/Docker proxy can make many LAN visitors share a backend IP.
    # Scope lockouts to the attempted account as well as the peer address.
    return (ip, username.strip().casefold())


def check_rate_limit(ip: str, username: str) -> None:
    key = _attempt_key(ip, username)
    with _attempt_lock:
        count, reset = _attempts.get(key, (0, 0.0))
        if reset <= monotonic():
            _attempts.pop(key, None)
        elif count >= 5:
            raise HTTPException(429, "Too many sign-in attempts. Try again later.")


def record_failed_login(ip: str, username: str) -> None:
    key = _attempt_key(ip, username)
    with _attempt_lock:
        count, reset = _attempts.get(key, (0, 0.0))
        _attempts[key] = (count + 1, reset if reset > monotonic() else monotonic() + 300)


def clear_failed_logins(ip: str, username: str) -> None:
    with _attempt_lock:
        _attempts.pop(_attempt_key(ip, username), None)


class AuthService:
    def __init__(self, database: Session):
        self.db = database

    @staticmethod
    def read(user: User) -> UserRead:
        return UserRead(
            id=user.id, username=user.username, is_admin=user.is_admin, is_primary_admin=user.is_primary_admin, is_active=user.is_active,
            must_change_password=user.must_change_password,
            permissions=sorted(item.permission for item in user.permissions),
            allowed_tree_ids=sorted(item.tree_id for item in user.tree_grants),
            tree_access_mode=user.tree_access_mode,
            created_at=user.created_at, updated_at=user.updated_at, last_login_at=user.last_login_at,
        )

    def event(self, kind: str, actor: User | None = None, subject: User | None = None) -> None:
        self.db.add(SecurityEvent(event_type=kind, actor_user_id=actor.id if actor else None,
                                  subject_user_id=subject.id if subject else None))

    def bootstrap(self, username: str | None = None, password: str | None = None) -> None:
        if self.db.scalar(select(func.count()).select_from(User).where(User.is_admin.is_(True))) > 0:
            return
        username, password = username or "admin", password or "admin"
        if self.db.scalar(select(func.count()).select_from(User)):
            raise RuntimeError("No Administrator exists in a populated user database; recover an Admin explicitly")
        if password == "admin" and any(self.db.scalar(select(func.count()).select_from(model)) for model in
                                       (Tree, Secret, ProviderConnection, ToolConnection)):
            raise RuntimeError("Default admin/admin is allowed only for a genuinely fresh database; configure a strong bootstrap password")
        if password != "admin" or username.strip().casefold() != "admin":
            validate_password(password)
        if self.db.scalar(select(User.id).where(User.username_key == username.strip().casefold())):
            raise RuntimeError("Bootstrap Admin username already belongs to a non-Admin account")
        user = User(username=username.strip(), username_key=username.strip().casefold(),
                    password_hash=HASHER.hash(password), is_admin=True, is_primary_admin=True,
                    is_active=True, must_change_password=(password == "admin"))
        self.db.add(user)
        self.db.flush()
        self.event("primary_admin_bootstrapped", subject=user)
        self.db.commit()

    def account(self, user: User, session: UserSession | None) -> AccountRead:
        trees = self.my_trees(user)
        count = self.db.scalar(select(func.count()).select_from(ApiToken).where(
            ApiToken.user_id == user.id, ApiToken.revoked_at.is_(None))) or 0
        return AccountRead(user=self.read(user), session_expires_at=session.expires_at if session else None,
                           allowed_trees=[AccountTree(id=tree.id, name=tree.name) for tree in trees],
                           active_token_count=count)

    def login(self, username: str, password: str, ip: str) -> tuple[User, str]:
        check_rate_limit(ip, username)
        user = self.db.scalar(select(User).where(User.username_key == username.strip().casefold()))
        valid = verify_password(user.password_hash if user else _DUMMY_HASH, password)
        if not user or not valid or not user.is_active:
            record_failed_login(ip, username)
            self.event("login_failed")
            self.db.commit()
            raise HTTPException(401, "Invalid username or password")
        clear_failed_logins(ip, username)
        raw = token_urlsafe(48)
        self.db.add(UserSession(user_id=user.id, token_hash=digest(raw), expires_at=now() + timedelta(seconds=SESSION_SECONDS)))
        user.last_login_at = now()
        self.event("login_succeeded", user, user)
        self.db.commit()
        return user, raw

    def session_user(self, raw: str) -> tuple[User, UserSession] | None:
        record = self.db.scalar(select(UserSession).where(UserSession.token_hash == digest(raw)))
        if not record or utc(record.expires_at) <= now():
            return None
        user = self.db.get(User, record.user_id)
        return (user, record) if user and user.is_active else None

    def token_user(self, raw: str) -> User | None:
        resolved = self.resolve_token(raw)
        return resolved[0] if resolved else None

    def resolve_token(self, raw: str) -> tuple[User, ApiToken] | None:
        if not raw.startswith("ats_") or len(raw) > 128:
            return None
        record = self.db.scalar(select(ApiToken).where(ApiToken.token_hash == digest(raw), ApiToken.revoked_at.is_(None)))
        user = self.db.get(User, record.user_id) if record else None
        return (user, record) if user and user.is_active and not user.must_change_password else None

    def mark_token_used(self, token: ApiToken) -> None:
        # Coarse timestamp avoids a write on every successful API request.
        if token.last_used_at is None or (now() - utc(token.last_used_at)).total_seconds() >= 300:
            token.last_used_at = now()
            self.db.commit()

    def logout(self, session: UserSession, actor: User) -> None:
        self.db.delete(session)
        self.event("logout", actor, actor)
        self.db.commit()

    def change_password(self, user: User, current: str, new: str, session: UserSession) -> None:
        if not verify_password(user.password_hash, current):
            raise HTTPException(400, "Current password is incorrect")
        validate_password(new)
        if current == new:
            raise HTTPException(422, "Choose a different password")
        user.password_hash = HASHER.hash(new)
        user.must_change_password = False
        self.db.execute(delete(UserSession).where(UserSession.user_id == user.id, UserSession.id != session.id))
        for token in user.api_tokens:
            token.revoked_at = now()
        self.event("password_changed", user, user)
        self.db.commit()

    def list_users(self) -> list[UserRead]:
        return [self.read(user) for user in self.db.scalars(select(User).order_by(User.username_key))]

    def get_user(self, user_id: str) -> User:
        user = self.db.get(User, user_id)
        if not user:
            raise HTTPException(404, "User not found")
        return user

    def _set_grants(self, user: User, permissions: list[str], tree_ids: list[str]) -> None:
        if any(permission not in PERMISSIONS for permission in permissions):
            raise HTTPException(422, "Unknown permission")
        unique_ids = set(tree_ids)
        if unique_ids:
            found = set(self.db.scalars(select(Tree.id).where(Tree.id.in_(unique_ids))))
            if found != unique_ids:
                raise HTTPException(422, "One or more Trees do not exist")
        self.db.flush()
        user.permissions.clear()
        user.tree_grants.clear()
        self.db.flush()
        user.permissions.extend(UserPermission(permission=item) for item in sorted(set(permissions)))
        user.tree_grants.extend(UserTreeAccess(tree_id=item) for item in sorted(unique_ids))

    def create_user(self, request: CreateUserRequest, actor: User | None) -> UserRead:
        username = request.username.strip()
        if not username or any(char.isspace() for char in username):
            raise HTTPException(422, "Username must not contain spaces")
        if self.db.scalar(select(User.id).where(User.username_key == username.casefold())):
            raise HTTPException(409, "Username already exists")
        validate_password(request.password)
        user = User(username=username, username_key=username.casefold(),
                    password_hash=HASHER.hash(request.password), is_admin=request.is_admin,
                    must_change_password=not request.is_admin, tree_access_mode=request.tree_access_mode)
        self.db.add(user)
        self.db.flush()
        self._set_grants(user, request.permissions, request.allowed_tree_ids)
        self.event("user_created", actor, user)
        self.db.commit()
        return self.read(user)

    def _guard_last_admin(self, user: User) -> None:
        if user.is_admin and user.is_active:
            active_ids = list(self.db.scalars(select(User.id).where(User.is_admin.is_(True), User.is_active.is_(True)).with_for_update()))
            if len(active_ids) <= 1:
                raise HTTPException(409, "The last active Admin cannot be removed or deactivated")

    def update_user(self, user_id: str, request: UpdateUserRequest, actor: User) -> UserRead:
        user = self.get_user(user_id)
        if user.is_primary_admin and (request.is_active is False or request.is_admin is False):
            raise HTTPException(409, "The primary administrator account cannot be deactivated or lose Admin access")
        if (request.is_active is False or request.is_admin is False) and user.is_admin and user.is_active:
            self._guard_last_admin(user)
        if request.is_admin is not None:
            user.is_admin = request.is_admin
        if request.is_active is not None:
            user.is_active = request.is_active
        if request.tree_access_mode is not None:
            user.tree_access_mode = request.tree_access_mode
        if request.permissions is not None or request.allowed_tree_ids is not None or request.tree_access_mode is not None:
            self._set_grants(user,
                             request.permissions if request.permissions is not None else [item.permission for item in user.permissions],
                             request.allowed_tree_ids if request.allowed_tree_ids is not None else [item.tree_id for item in user.tree_grants])
            self.event("permissions_or_tree_access_changed", actor, user)
        if request.is_active is False:
            self.event("user_deactivated", actor, user)
        self.db.commit()
        return self.read(user)

    def reset_password(self, user_id: str, password: str, actor: User) -> None:
        user = self.get_user(user_id)
        validate_password(password)
        user.password_hash = HASHER.hash(password)
        user.must_change_password = True
        self.db.execute(delete(UserSession).where(UserSession.user_id == user.id))
        for token in user.api_tokens:
            token.revoked_at = now()
        self.event("password_reset", actor, user)
        self.db.commit()

    def delete_user(self, user_id: str, actor: User) -> None:
        user = self.get_user(user_id)
        if user.is_primary_admin:
            raise HTTPException(409, "The primary administrator account cannot be deleted")
        self._guard_last_admin(user)
        self.event("user_deleted", actor, user)
        self.db.delete(user)
        self.db.commit()

    def my_trees(self, user: User) -> list[Tree]:
        query = select(Tree).order_by(Tree.name)
        if not user.is_admin and not any(item.permission == "use_trees" for item in user.permissions):
            return []
        if not user.is_admin and user.tree_access_mode == "selected":
            query = query.join(UserTreeAccess, UserTreeAccess.tree_id == Tree.id).where(UserTreeAccess.user_id == user.id)
        return list(self.db.scalars(query))

    def can_use_tree(self, user: User, tree_id: str) -> bool:
        """Identity-based rule shared by cookie and API-token requests."""
        if user.is_admin:
            return True
        if not any(item.permission == "use_trees" for item in user.permissions):
            return False
        if user.tree_access_mode == "all":
            return True
        return self.db.scalar(select(UserTreeAccess).where(
            UserTreeAccess.user_id == user.id, UserTreeAccess.tree_id == tree_id,
        )) is not None

    def create_token(self, user: User, name: str) -> TokenCreated:
        if not name.strip():
            raise HTTPException(422, "API key name is required")
        raw = "ats_" + token_urlsafe(48)
        token = ApiToken(user_id=user.id, name=name.strip(), token_hash=digest(raw))
        self.db.add(token)
        self.event("api_token_created", user, user)
        self.db.commit()
        return TokenCreated(id=token.id, name=token.name, created_at=token.created_at, token=raw)

    def list_tokens(self, user: User) -> list[TokenRead]:
        return [TokenRead(id=item.id, name=item.name, created_at=item.created_at, last_used_at=item.last_used_at)
                for item in self.db.scalars(select(ApiToken).where(ApiToken.user_id == user.id, ApiToken.revoked_at.is_(None)))]

    def revoke_token(self, user: User, token_id: str) -> None:
        token = self.db.scalar(select(ApiToken).where(ApiToken.id == token_id, ApiToken.user_id == user.id))
        if not token:
            raise HTTPException(404, "Token not found")
        token.revoked_at = now()
        self.event("api_token_revoked", user, user)
        self.db.commit()
