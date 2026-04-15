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
