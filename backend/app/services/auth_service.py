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
