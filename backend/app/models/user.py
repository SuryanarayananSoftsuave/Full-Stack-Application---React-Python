from datetime import datetime
from uuid import uuid4

from pydantic import BaseModel, EmailStr, Field


def _uuid() -> str:
    return str(uuid4())


# ── Request models ───────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=100)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


# ── Database document model ──────────────────────────────────────────────────

class UserInDB(BaseModel):
    id: str = Field(default_factory=_uuid, alias="_id")
    email: str
    hashed_password: str
    full_name: str
    is_active: bool = True
    roles: list[str] = Field(default_factory=lambda: ["user"])
    permissions: list[str] = Field(default_factory=lambda: ["user:read"])
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"populate_by_name": True}


# ── Response models ──────────────────────────────────────────────────────────

class UserResponse(BaseModel):
    id: str = Field(alias="_id")
    email: str
    full_name: str
    is_active: bool
    roles: list[str]
    permissions: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"populate_by_name": True}


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MessageResponse(BaseModel):
    message: str


class TokenPayload(BaseModel):
    sub: str
    type: str = "access"
    roles: list[str] = []
    permissions: list[str] = []
    exp: datetime | None = None
