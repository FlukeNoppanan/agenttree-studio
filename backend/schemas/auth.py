"""Public authentication contracts; hashes and stored token digests stay private."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Permission = Literal[
    "manage_trees_agents", "manage_secrets", "manage_providers_models",
    "manage_tools_mcp", "view_executions", "use_trees",
]
TreeAccessMode = Literal["selected", "all"]


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=160)
    password: str = Field(min_length=1, max_length=1024)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=12, max_length=1024)


class UserRead(BaseModel):
    id: str
    username: str
    is_admin: bool
    is_primary_admin: bool
    is_active: bool
    must_change_password: bool
    permissions: list[Permission]
    allowed_tree_ids: list[str]
    tree_access_mode: TreeAccessMode
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None


class CreateUserRequest(BaseModel):
    username: str = Field(min_length=1, max_length=160)
    password: str = Field(min_length=12, max_length=1024)
    is_admin: bool = False
    permissions: list[Permission] = Field(default_factory=list)
    allowed_tree_ids: list[str] = Field(default_factory=list)
    tree_access_mode: TreeAccessMode = "selected"


class UpdateUserRequest(BaseModel):
    is_admin: bool | None = None
    is_active: bool | None = None
    permissions: list[Permission] | None = None
    allowed_tree_ids: list[str] | None = None
    tree_access_mode: TreeAccessMode | None = None


class ResetPasswordRequest(BaseModel):
    password: str = Field(min_length=12, max_length=1024)


class TokenCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)


class TokenRead(BaseModel):
    id: str
    name: str
    created_at: datetime
    last_used_at: datetime | None = None


class TokenCreated(TokenRead):
    token: str


class SecurityEventRead(BaseModel):
    id: str
    event_type: str
    actor_username: str | None
    subject_user_id: str | None
    created_at: datetime


class SecurityEventPage(BaseModel):
    items: list[SecurityEventRead]
    total: int
    page: int
    page_size: int
    event_types: list[str]


class AccountTree(BaseModel):
    id: str
    name: str


class AccountRead(BaseModel):
    user: UserRead
    session_expires_at: datetime | None
    allowed_trees: list[AccountTree]
    active_token_count: int
