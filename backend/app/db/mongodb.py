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
    await db["tasks"].create_index("created_by")
    await db["tasks"].create_index("assignee_id")
    await db["tasks"].create_index("status")
    await db["tasks"].create_index("created_at")

    yield

    client.close()


async def get_database() -> AsyncGenerator[AsyncIOMotorDatabase, None]:
    if client is None:
        raise RuntimeError("Database client not initialised – is the app running?")
    yield client[settings.MONGODB_DB_NAME]
