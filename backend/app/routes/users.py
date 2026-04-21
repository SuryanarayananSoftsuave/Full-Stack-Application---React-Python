from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db.mongodb import get_database
from app.dependencies.auth import get_current_active_user
from app.models.user import UserSummary
from app.services.user_service import list_users

router = APIRouter(prefix="/users", tags=["Users"])


@router.get(
    "",
    response_model=list[UserSummary],
    summary="List users with optional filters",
)
async def get_users(
    department: str | None = Query(None),
    is_active: bool | None = Query(None),
    search: str | None = Query(None),
    _=Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    return await list_users(
        db,
        department=department,
        is_active=is_active,
        search=search,
    )
