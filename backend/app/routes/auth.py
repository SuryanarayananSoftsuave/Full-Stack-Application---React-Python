from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import settings
from app.db.mongodb import get_database
from app.dependencies.auth import get_current_active_user
from app.models.user import (
    LoginResponse,
    MessageResponse,
    UserCreate,
    UserLogin,
    UserResponse,
    UserInDB,
)
from app.services.auth_service import authenticate_user, refresh_tokens, register_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        domain=settings.COOKIE_DOMAIN,
        max_age=settings.REFRESH_TOKEN_EXPIRE_MINUTES * 60,
        path="/api/auth/refresh",
    )


def _clear_refresh_cookie(response: Response) -> None:
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
    response_model=LoginResponse,
    summary="Authenticate and receive access token",
)
async def login(
    data: UserLogin,
    response: Response,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    tokens = await authenticate_user(db, data.email, data.password)
    _set_refresh_cookie(response, tokens.refresh_token)
    return LoginResponse(access_token=tokens.access_token)


@router.post(
    "/refresh",
    response_model=LoginResponse,
    summary="Get a new access token using the refresh_token cookie",
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
    _set_refresh_cookie(response, tokens.refresh_token)
    return LoginResponse(access_token=tokens.access_token)


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Clear refresh token cookie",
)
async def logout(response: Response):
    _clear_refresh_cookie(response)
    return MessageResponse(message="Logged out")


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get the current authenticated user",
)
async def me(user: UserInDB = Depends(get_current_active_user)):
    return UserResponse(**user.model_dump(by_alias=True))
