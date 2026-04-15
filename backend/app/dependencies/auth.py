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
