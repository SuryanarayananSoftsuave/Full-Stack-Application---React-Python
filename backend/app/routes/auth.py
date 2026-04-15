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


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
async def register(
    data: UserCreate,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    return await register_user(db, data)


@router.post(
    "/login",
    response_model=MessageResponse,
    summary="Authenticate and receive tokens via httponly cookies",
)
async def login(
    data: UserLogin,
    response: Response,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    tokens = await authenticate_user(db, data.email, data.password)
    _set_auth_cookies(response, tokens.access_token, tokens.refresh_token)
    return MessageResponse(message="Login successful")


@router.post(
    "/refresh",
    response_model=MessageResponse,
    summary="Refresh tokens using the refresh_token cookie",
)
async def refresh(
    request: Request,
    response: Response,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing",
        )
    tokens = await refresh_tokens(db, token)
    _set_auth_cookies(response, tokens.access_token, tokens.refresh_token)
    return MessageResponse(message="Tokens refreshed")


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Clear auth cookies",
)
async def logout(response: Response):
    _clear_auth_cookies(response)
    return MessageResponse(message="Logged out")


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get the current authenticated user",
)
async def me(user: UserInDB = Depends(get_current_active_user)):
    return UserResponse(**user.model_dump(by_alias=True))
