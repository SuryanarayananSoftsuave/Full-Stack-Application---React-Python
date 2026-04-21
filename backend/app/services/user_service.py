from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.user import UserInDB, UserSummary


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


async def list_users(
    db: AsyncIOMotorDatabase,
    department: str | None = None,
    is_active: bool | None = True,   # ← changed default
    search: str | None = None,
    limit: int = 500,                # ← exposed limit
) -> list[UserSummary]:
    query: dict = {}
    if department is not None:
        query["department"] = department
    if is_active is not None:
        query["is_active"] = is_active
    if search:
        query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
        ]

    cursor = (
        db["users"]
        .find(query, {"full_name": 1, "email": 1, "department": 1})
        .sort("full_name", 1)
    )
    docs = await cursor.to_list(length=limit)
    return [UserSummary(**doc) for doc in docs]
