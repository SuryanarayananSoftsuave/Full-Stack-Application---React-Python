# Full-Stack Auth App -- Build Walkthrough

A step-by-step guide to building a production-grade FastAPI + React authentication system with httpOnly cookies, JWT token refresh, and role-based permissions.

---

## Table of Contents

- [Backend (FastAPI)](#backend-fastapi)
  - [Architecture](#architecture)
  - [Step 1: Folder Structure](#step-1-folder-structure)
  - [Step 2: Config](#step-2-config)
  - [Step 3: Database (MongoDB + Motor)](#step-3-database-mongodb--motor)
  - [Step 4: User Models](#step-4-user-models)
  - [Step 5: Security (Password Hashing + JWT)](#step-5-security-password-hashing--jwt)
  - [Step 6: Permissions System](#step-6-permissions-system)
  - [Step 7: User Service](#step-7-user-service)
  - [Step 8: Auth Service](#step-8-auth-service)
  - [Step 9: Auth Dependencies](#step-9-auth-dependencies)
  - [Step 10: Auth Routes](#step-10-auth-routes)
  - [Step 11: App Entry Point](#step-11-app-entry-point)
- [Frontend (React + Vite)](#frontend-react--vite)
  - [Step 12: Scaffold & Proxy](#step-12-scaffold--proxy)
  - [Step 13: Axios Client with Retry Mechanism](#step-13-axios-client-with-retry-mechanism)
  - [Step 14: Auth API Layer](#step-14-auth-api-layer)
  - [Step 15: Auth Context & Hook](#step-15-auth-context--hook)
  - [Step 16: Route Guards](#step-16-route-guards)
  - [Step 17: Global Styles](#step-17-global-styles)
  - [Step 18: Login Page](#step-18-login-page)
  - [Step 19: Register Page](#step-19-register-page)
  - [Step 20: Home Page](#step-20-home-page)
  - [Step 21: App Router](#step-21-app-router)
  - [Step 22: Sidebar + Navbar Layout](#step-22-sidebar--navbar-layout)
- [Fixes & Lessons Learned](#fixes--lessons-learned)

---

## Backend (FastAPI)

### Architecture

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                  # App factory, lifespan, CORS, router mounting
│   ├── config.py                # Pydantic Settings (env-based config)
│   ├── db/
│   │   └── mongodb.py           # Motor client init, get_database dependency
│   ├── models/
│   │   └── user.py              # Pydantic request/response/DB models
│   ├── routes/
│   │   └── auth.py              # POST /register, /login, /refresh, /logout, GET /me
│   ├── services/
│   │   ├── auth_service.py      # register_user, authenticate_user, refresh_tokens
│   │   └── user_service.py      # get_user_by_id, get_user_by_email
│   ├── core/
│   │   ├── security.py          # hash_password, verify_password, JWT create/decode
│   │   └── permissions.py       # Role enum, Permission enum, PermissionChecker
│   └── dependencies/
│       └── auth.py              # get_current_user, get_current_active_user
├── .env.example
├── requirements.txt
└── README.md
```

**Key design decisions:**

- **Route layer + Service layer separation**: Routes handle HTTP concerns (status codes, request parsing). Services handle business logic (validation, DB operations). This keeps each layer testable and focused.
- **String UUIDs** instead of MongoDB ObjectId for user IDs -- portable and serialization-friendly.
- **HTTPOnly cookies** for tokens -- the browser manages them automatically, and JavaScript cannot read them (XSS protection).
- **Dual permission system**: Roles (admin, user, moderator) + fine-grained permissions (user:read, user:delete, etc.).

---

### Step 1: Folder Structure

Create all directories and `__init__.py` files:

```
backend/app/
backend/app/db/
backend/app/models/
backend/app/routes/
backend/app/services/
backend/app/core/
backend/app/dependencies/
```

Each subfolder gets an empty `__init__.py` to make it a Python package.

---

### Step 2: Config

**`app/config.py`** -- Uses Pydantic Settings to load environment variables from a `.env` file.

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    APP_NAME: str = "FastAPI Auth Backend"
    DEBUG: bool = False

    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "fastapi_auth"

    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"
    COOKIE_DOMAIN: str | None = None

    CORS_ORIGINS: list[str] = ["http://localhost:3000"]


settings = Settings()
```

**Why Pydantic Settings?** It validates env vars at startup. If `MONGODB_URL` is missing or `ACCESS_TOKEN_EXPIRE_MINUTES` isn't a valid integer, the app crashes immediately with a clear error -- not at runtime when a request hits.

---

### Step 3: Database (MongoDB + Motor)

**`app/db/mongodb.py`** -- Async Motor client with FastAPI lifespan.

```python
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import settings

client: AsyncIOMotorClient | None = None


@asynccontextmanager
async def lifespan(_app):
    global client
    client = AsyncIOMotorClient(settings.MONGODB_URL)

    db = client[settings.MONGODB_DB_NAME]
    await db["users"].create_index("email", unique=True)

    yield

    client.close()


async def get_database() -> AsyncGenerator[AsyncIOMotorDatabase, None]:
    if client is None:
        raise RuntimeError("Database client not initialised – is the app running?")
    yield client[settings.MONGODB_DB_NAME]
```

**Why lifespan?** The Motor client is created once when the app starts and closed when it shuts down. The `get_database` function is a FastAPI dependency that yields the database instance to route handlers.

**Why `create_index("email", unique=True)`?** Enforces email uniqueness at the database level. Even if our service-layer check has a race condition (two requests registering the same email simultaneously), MongoDB will reject the duplicate.

---

### Step 4: User Models

**`app/models/user.py`** -- All Pydantic models for requests, responses, and the DB document.

```python
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


class MessageResponse(BaseModel):
    message: str


class TokenPayload(BaseModel):
    sub: str
    type: str = "access"
    roles: list[str] = []
    permissions: list[str] = []
    exp: datetime | None = None
```

**Why separate `UserInDB` and `UserResponse`?** `UserInDB` contains `hashed_password` which must never be sent to the client. `UserResponse` excludes it. This is the DTO (Data Transfer Object) pattern -- different shapes for different boundaries.

**Why `alias="_id"`?** MongoDB uses `_id` as its primary key field. The alias lets Pydantic read/write `_id` in MongoDB documents while exposing `id` in Python code.

---

### Step 5: Security (Password Hashing + JWT)

**`app/core/security.py`** -- Password hashing with SHA-256 pre-hash + bcrypt, and JWT token creation/decoding.

```python
import base64
import hashlib
from datetime import datetime, timedelta

from jose import jwt
from passlib.context import CryptContext

from app.config import settings
from app.models.user import TokenPayload

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Password utilities ───────────────────────────────────────────────────────

def _prehash(plain: str) -> str:
    digest = hashlib.sha256(plain.encode("utf-8")).digest()
    return base64.b64encode(digest).decode("ascii")


def hash_password(plain: str) -> str:
    return pwd_context.hash(_prehash(plain))


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(_prehash(plain), hashed)


# ── JWT utilities ────────────────────────────────────────────────────────────

def create_access_token(
    user_id: str,
    roles: list[str],
    permissions: list[str],
) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "type": "access",
        "roles": roles,
        "permissions": permissions,
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> TokenPayload:
    """Decode and validate a JWT. Raises JWTError on any failure."""
    raw = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    return TokenPayload(**raw)
```

**Why SHA-256 pre-hash before bcrypt?** Bcrypt has a hard 72-byte input limit. Newer `bcrypt` packages crash instead of silently truncating. SHA-256 compresses any password into a fixed 44-byte base64 string, safely under the limit. This is the same pattern Django uses ("bcrypt + SHA-256").

**Why access tokens carry roles and permissions?** So the backend can make authorization decisions from the token alone without a DB query. The refresh token only carries `sub` (user ID) because it's only used to issue new tokens, not to authorize actions.

---

### Step 6: Permissions System

**`app/core/permissions.py`** -- Role and Permission enums, plus a `PermissionChecker` callable class that works as a FastAPI dependency.

```python
from enum import Enum

from fastapi import Depends, HTTPException, status

from app.dependencies.auth import get_current_active_user
from app.models.user import UserInDB


class Role(str, Enum):
    ADMIN = "admin"
    USER = "user"
    MODERATOR = "moderator"


class Permission(str, Enum):
    USER_READ = "user:read"
    USER_CREATE = "user:create"
    USER_UPDATE = "user:update"
    USER_DELETE = "user:delete"


class PermissionChecker:
    def __init__(
        self,
        required_roles: list[Role] | None = None,
        required_permissions: list[Permission] | None = None,
    ):
        self.required_roles = required_roles or []
        self.required_permissions = required_permissions or []

    async def __call__(
        self,
        user: UserInDB = Depends(get_current_active_user),
    ) -> UserInDB:
        if self.required_roles:
            if not any(role.value in user.roles for role in self.required_roles):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Insufficient role privileges",
                )

        if self.required_permissions:
            user_perms = set(user.permissions)
            missing = [p.value for p in self.required_permissions if p.value not in user_perms]
            if missing:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Missing permissions: {', '.join(missing)}",
                )

        return user
```

**Usage:**

```python
@router.get(
    "/admin-only",
    dependencies=[Depends(PermissionChecker(required_roles=[Role.ADMIN]))],
)
async def admin_panel():
    ...
```

**Why a callable class instead of a plain function?** A function can't be parameterized at the route level. The class pattern lets you create different checker instances with different requirements (`PermissionChecker(required_roles=[Role.ADMIN])` vs `PermissionChecker(required_permissions=[Permission.USER_DELETE])`).

**Role check logic:** User must have **at least one** of the required roles. Permission check logic: user must have **all** required permissions.

---

### Step 7: User Service

**`app/services/user_service.py`** -- Simple DB lookup helpers.

```python
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.user import UserInDB


async def get_user_by_email(db: AsyncIOMotorDatabase, email: str) -> UserInDB | None:
    doc = await db["users"].find_one({"email": email})
    if doc is None:
        return None
    return UserInDB(**doc)


async def get_user_by_id(db: AsyncIOMotorDatabase, user_id: str) -> UserInDB | None:
    doc = await db["users"].find_one({"_id": user_id})
    if doc is None:
        return None
    return UserInDB(**doc)
```

**Why a separate service layer?** Routes shouldn't contain DB queries directly. The service layer encapsulates data access, making it reusable (both `auth_service` and `dependencies/auth.py` need `get_user_by_id`) and testable (you can mock the service in tests without mocking MongoDB).

---

### Step 8: Auth Service

**`app/services/auth_service.py`** -- Business logic for registration, login, and token refresh.

```python
from datetime import datetime

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import TokenPair, UserCreate, UserInDB, UserResponse
from app.services.user_service import get_user_by_email, get_user_by_id


async def register_user(db: AsyncIOMotorDatabase, data: UserCreate) -> UserResponse:
    existing = await get_user_by_email(db, data.email)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    user = UserInDB(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
    )
    await db["users"].insert_one(user.model_dump(by_alias=True))
    return UserResponse(**user.model_dump(by_alias=True))


async def authenticate_user(db: AsyncIOMotorDatabase, email: str, password: str) -> TokenPair:
    user = await get_user_by_email(db, email)
    if user is None or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    return TokenPair(
        access_token=create_access_token(user.id, user.roles, user.permissions),
        refresh_token=create_refresh_token(user.id),
    )


async def refresh_tokens(db: AsyncIOMotorDatabase, refresh_token: str) -> TokenPair:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_token(refresh_token)
    except Exception:
        raise credentials_exc

    if payload.type != "refresh":
        raise credentials_exc

    user = await get_user_by_id(db, payload.sub)
    if user is None or not user.is_active:
        raise credentials_exc

    await db["users"].update_one(
        {"_id": user.id},
        {"$set": {"updated_at": datetime.utcnow()}},
    )

    return TokenPair(
        access_token=create_access_token(user.id, user.roles, user.permissions),
        refresh_token=create_refresh_token(user.id),
    )
```

**Why the same error message for "user not found" and "wrong password"?** Returning `"Invalid email or password"` for both prevents attackers from enumerating valid email addresses. If you said "user not found" vs "wrong password," an attacker could learn which emails are registered.

---

### Step 9: Auth Dependencies

**`app/dependencies/auth.py`** -- FastAPI dependencies that extract the user from httpOnly cookies.

```python
from fastapi import Depends, HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.security import decode_token
from app.db.mongodb import get_database
from app.models.user import UserInDB
from app.services.user_service import get_user_by_id


def _get_token_from_cookie(request: Request) -> str:
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    return token


async def get_current_user(
    token: str = Depends(_get_token_from_cookie),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> UserInDB:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )

    try:
        payload = decode_token(token)
    except Exception:
        raise credentials_exc

    if payload.type != "access":
        raise credentials_exc

    user = await get_user_by_id(db, payload.sub)
    if user is None:
        raise credentials_exc

    return user


async def get_current_active_user(
    user: UserInDB = Depends(get_current_user),
) -> UserInDB:
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account",
        )
    return user
```

**Why read from cookies instead of the Authorization header?** Because our tokens are stored in httpOnly cookies. The browser sends them automatically -- the frontend JavaScript never sees them. This protects against XSS attacks where malicious scripts could steal tokens from localStorage.

**Why two dependencies (`get_current_user` + `get_current_active_user`)?** Separation of concerns. `get_current_user` only checks if the token is valid. `get_current_active_user` adds an `is_active` check. Some admin routes might intentionally use `get_current_user` to allow viewing deactivated accounts.

---

### Step 10: Auth Routes

**`app/routes/auth.py`** -- HTTP endpoints that set/clear httpOnly cookies.

```python
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import settings
from app.db.mongodb import get_database
from app.dependencies.auth import get_current_active_user
from app.models.user import (
    MessageResponse,
    UserCreate,
    UserLogin,
    UserResponse,
    UserInDB,
)
from app.services.auth_service import authenticate_user, refresh_tokens, register_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        domain=settings.COOKIE_DOMAIN,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        domain=settings.COOKIE_DOMAIN,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/auth/refresh",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/api/auth/refresh")


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(data: UserCreate, db: AsyncIOMotorDatabase = Depends(get_database)):
    return await register_user(db, data)


@router.post("/login", response_model=MessageResponse)
async def login(data: UserLogin, response: Response, db: AsyncIOMotorDatabase = Depends(get_database)):
    tokens = await authenticate_user(db, data.email, data.password)
    _set_auth_cookies(response, tokens.access_token, tokens.refresh_token)
    return MessageResponse(message="Login successful")


@router.post("/refresh", response_model=MessageResponse)
async def refresh(request: Request, response: Response, db: AsyncIOMotorDatabase = Depends(get_database)):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token missing")
    tokens = await refresh_tokens(db, token)
    _set_auth_cookies(response, tokens.access_token, tokens.refresh_token)
    return MessageResponse(message="Tokens refreshed")


@router.post("/logout", response_model=MessageResponse)
async def logout(response: Response):
    _clear_auth_cookies(response)
    return MessageResponse(message="Logged out")


@router.get("/me", response_model=UserResponse)
async def me(user: UserInDB = Depends(get_current_active_user)):
    return UserResponse(**user.model_dump(by_alias=True))
```

**Why is the refresh_token cookie scoped to `path="/api/auth/refresh"`?** The browser only sends it on requests to that specific path. This way, the refresh token isn't sent with every API call -- only when explicitly refreshing. Minimizes exposure.

**Why does login return `MessageResponse` instead of token data?** The tokens are in the cookies (httpOnly, invisible to JavaScript). The response body just confirms success.

---

### Step 11: App Entry Point

**`app/main.py`** -- FastAPI app factory with CORS and lifespan.

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.mongodb import lifespan
from app.routes.auth import router as auth_router


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        debug=settings.DEBUG,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_router, prefix="/api")

    return app


app = create_app()
```

**Run with:** `uvicorn app.main:app --port 8000 --reload`

---

## Frontend (React + Vite)

### Step 12: Scaffold & Proxy

```bash
npm create vite@latest frontend -- --template react
cd frontend
npm install
npm install axios react-router-dom
```

**`vite.config.js`** -- Proxy `/api` requests to the backend:

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
```

**Why a proxy?** HTTPOnly cookies are scoped to the origin. Without a proxy, the frontend (`localhost:3000`) and backend (`localhost:8000`) are different origins, and cookies won't flow. The proxy makes all `/api/*` requests appear same-origin to the browser.

---

### Step 13: Axios Client with Retry Mechanism

**`src/api/client.js`** -- The most critical frontend file. Single Axios instance with:
- `withCredentials: true` to send httpOnly cookies
- Response interceptor that catches 401, silently refreshes, and retries
- Queue mechanism to prevent multiple simultaneous refresh calls

```javascript
import axios from "axios";

const client = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
  // CRITICAL: Without this, the browser won't send httpOnly cookies.
  withCredentials: true,
});

// ── Refresh state ───────────────────────────────────────────────────────────
// Coordinates the "refresh once, retry many" pattern.
// If 3 requests all get 401 simultaneously, only 1 refresh call fires.
// The other 2 wait in the queue and retry after the refresh succeeds.
let isRefreshing = false;
let failedQueue = [];

function processQueue(error) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve();
    }
  });
  failedQueue = [];
}

// ── Response interceptor ────────────────────────────────────────────────────
client.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalRequest = error.config;

    // Auth endpoints return 401 for business reasons (wrong password),
    // not because of expired tokens. Don't try to refresh for those.
    const url = originalRequest.url || "";
    const isAuthEndpoint =
      url.includes("/auth/login") ||
      url.includes("/auth/register") ||
      url.includes("/auth/refresh");

    if (
      error.response?.status !== 401 ||
      originalRequest._retry ||
      isAuthEndpoint
    ) {
      return Promise.reject(error);
    }

    // Queue if another request is already refreshing
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(() => client(originalRequest));
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      // Use raw axios, NOT client -- avoids interceptor infinite loop
      await axios.post("/api/auth/refresh", {}, { withCredentials: true });
      processQueue(null);
      return client(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError);
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default client;
```

**Key decisions:**

| Decision | Why |
|---|---|
| `withCredentials: true` | Browser won't send httpOnly cookies without this |
| `_retry` flag | Prevents infinite retry loops |
| Raw `axios.post` for refresh | Using `client.post` would trigger the interceptor on the refresh call itself |
| `failedQueue` | Prevents multiple simultaneous refresh calls |
| Auth endpoint exclusion | A 401 from `/login` means "wrong password," not "expired token" |
| `window.location.href` guard | Prevents redirect loop when already on `/login` |

---

### Step 14: Auth API Layer

**`src/api/auth.js`** -- Clean wrappers around the Axios client. Components never touch Axios directly.

```javascript
import client from "./client";

const authApi = {
  register: async (email, password, fullName) => {
    const response = await client.post("/auth/register", {
      email,
      password,
      full_name: fullName,  // translate JS camelCase to Python snake_case
    });
    return response.data;
  },

  login: async (email, password) => {
    const response = await client.post("/auth/login", { email, password });
    return response.data;
  },

  logout: async () => {
    const response = await client.post("/auth/logout");
    return response.data;
  },

  getMe: async () => {
    const response = await client.get("/auth/me");
    return response.data;
  },
};

export default authApi;
```

**Why `response.data`?** Axios wraps responses in `{ status, headers, data }`. Unwrapping here means components get the clean payload: `const user = await authApi.getMe()` instead of `const res = await authApi.getMe(); const user = res.data`.

**Why no `refresh` function?** Refresh is handled entirely by the interceptor in `client.js`. Components never need to call it manually.

---

### Step 15: Auth Context & Hook

**`src/context/AuthContext.jsx`** -- React Context providing user state and auth actions to all components.

```jsx
import { createContext, useState, useEffect, useCallback } from "react";
import authApi from "../api/auth";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // loading starts true to prevent "flash of login page" on refresh
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const data = await authApi.getMe();
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // On mount, try to restore session from existing cookies
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = useCallback(
    async (email, password) => {
      await authApi.login(email, password);
      await fetchUser(); // verify cookie works end-to-end
    },
    [fetchUser]
  );

  const register = useCallback(async (email, password, fullName) => {
    const data = await authApi.register(email, password, fullName);
    return data; // no auto-login -- user must log in explicitly
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  const value = { user, loading, login, register, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

**`src/hooks/useAuth.js`** -- Convenience hook with error guard.

```javascript
import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
```

**Why `loading` starts as `true`?** Without it: App mounts → user is null → ProtectedRoute redirects to /login → THEN /me finishes and we realize user was logged in. With it: App shows nothing until /me resolves, then renders the correct page.

**Why `useCallback` on all actions?** Prevents unnecessary re-renders. Without it, new function references are created on every render, causing every context consumer to re-render.

---

### Step 16: Route Guards

**`src/components/ProtectedRoute.jsx`** -- Redirects to `/login` if not authenticated.

```jsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { AppLayout } from "./layout/AppLayout";

export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  return <AppLayout />;
}
```

**`src/components/GuestRoute.jsx`** -- Redirects to `/` if already authenticated.

```jsx
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function GuestRoute() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  return <Outlet />;
}
```

**Why `replace` on Navigate?** Without it, the back button loops: protected page → redirect to login → back → protected page → redirect to login... `replace` removes the entry from history.

---

### Step 17: Global Styles

**`src/styles/global.css`** -- CSS reset, variables, and base typography.

```css
*,
*::before,
*::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --color-primary: #4f46e5;
  --color-primary-hover: #4338ca;
  --color-danger: #dc2626;
  --color-text: #1f2937;
  --color-text-light: #6b7280;
  --color-bg: #f9fafb;
  --color-white: #ffffff;
  --color-border: #d1d5db;
  --color-border-focus: #4f46e5;
  --radius: 8px;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  --sidebar-width: 240px;
  --sidebar-collapsed-width: 64px;
  --navbar-height: 56px;
}

body {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--color-text);
  background-color: var(--color-bg);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

a {
  color: var(--color-primary);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}
```

Import in **`src/main.jsx`**: `import './styles/global.css'`

---

### Step 18: Login Page

**`src/pages/Login/LoginPage.jsx`** + **`LoginPage.module.css`**

Key patterns:
- `e.preventDefault()` to stop browser form submission
- `err.response?.data?.detail` for defensive error extraction
- `autoComplete="email"` / `autoComplete="current-password"` for password manager support
- `disabled={submitting}` to prevent double-submit

---

### Step 19: Register Page

**`src/pages/Register/RegisterPage.jsx`** + **`RegisterPage.module.css`**

Key patterns:
- `navigate("/login", { state: { registered: true } })` to pass success state via router
- `Array.isArray(data.detail)` check because FastAPI returns validation errors (422) as arrays but business errors (409) as strings
- `autoComplete="new-password"` tells the browser to offer password generation
- `minLength={8}` for client-side validation matching backend constraints

---

### Step 20: Home Page

**`src/pages/Home/HomePage.jsx`** -- Simple content, no layout chrome (the AppLayout handles that).

```jsx
import { useAuth } from "../../hooks/useAuth";
import styles from "./HomePage.module.css";

export function HomePage() {
  const { user } = useAuth();

  return (
    <div className={styles.page}>
      <h1 className={styles.greeting}>Hello, {user?.full_name}</h1>
      <p className={styles.email}>{user?.email}</p>
    </div>
  );
}
```

---

### Step 21: App Router

**`src/App.jsx`** -- Wires AuthProvider, Router, and route guards together.

```jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/protectedRoute";
import { GuestRoute } from "./components/GuestRoute";
import { LoginPage } from "./pages/Login/LoginPage";
import { RegisterPage } from "./pages/Register/Registerpage";
import { HomePage } from "./pages/Home/HomePage";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<HomePage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
```

**Nesting order matters:** `BrowserRouter` (outermost, provides routing) → `AuthProvider` (inside router so it can use `useNavigate` in the future) → `Routes` (inside auth so pages can call `useAuth`).

---

### Step 22: Sidebar + Navbar Layout

Three components that only appear on authenticated pages:

**`src/components/layout/AppLayout.jsx`** -- Owns sidebar collapsed state, composes Navbar + Sidebar + Outlet.

**`src/components/layout/Navbar.jsx`** -- Fixed top bar with app title, user name, logout button. `left` offset shifts based on sidebar state.

**`src/components/layout/Sidebar.jsx`** -- Collapsible sidebar (240px → 64px). Uses `NavLink` for active-link highlighting. `NAV_ITEMS` array makes adding new pages trivial.

**How it connects:** `ProtectedRoute` renders `AppLayout` (instead of bare `Outlet`). `AppLayout` renders `Outlet` in its content area. All child routes automatically get the sidebar + navbar.

---

## Fixes & Lessons Learned

### 1. Bcrypt + Passlib Crash

**Problem:** `passlib` is unmaintained. Its internal startup code (`detect_wrap_bug`) uses passwords longer than 72 bytes, which crashes with `bcrypt` 4.1+.

**Fix:** Pin `bcrypt==4.0.1` in `requirements.txt`, and pre-hash passwords with SHA-256 before bcrypt to remove the 72-byte limit permanently.

### 2. Login 401 Infinite Redirect Loop

**Problem:** Wrong credentials → 401 → interceptor tries to refresh → refresh fails → `window.location.href = "/login"` → page reloads → AuthContext calls `/me` → 401 → interceptor refreshes → fails → redirects → infinite loop.

**Fix:** Two changes in `client.js`:
1. Exclude auth endpoints (`/auth/login`, `/auth/register`, `/auth/refresh`) from the retry logic. A 401 from `/login` means "wrong password," not "expired token."
2. Guard the redirect: `if (window.location.pathname !== "/login")` -- don't redirect if already there.

### 3. Uvicorn Import Error

**Problem:** `uvicorn main:app` fails because `main.py` is inside the `app/` package.

**Fix:** Use the full Python module path: `uvicorn app.main:app --port 8000 --reload`.
