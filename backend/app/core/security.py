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
