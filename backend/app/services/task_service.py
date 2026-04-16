import math
from datetime import datetime

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from app.models.task import (
    PaginatedTasks,
    TaskCreate,
    TaskInDB,
    TaskResponse,
    TaskUpdate,
)


COLLECTION = "tasks"


async def create_task(
    db: AsyncIOMotorDatabase,
    data: TaskCreate,
    user_id: str,
) -> TaskResponse:
    task = TaskInDB(
        **data.model_dump(),
        created_by=user_id,
    )
    await db[COLLECTION].insert_one(task.model_dump(by_alias=True))
    return TaskResponse(**task.model_dump(by_alias=True))


async def get_task_by_id(
    db: AsyncIOMotorDatabase,
    task_id: str,
) -> TaskResponse:
    doc = await db[COLLECTION].find_one({"_id": task_id})
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    return TaskResponse(**doc)


async def list_tasks(
    db: AsyncIOMotorDatabase,
    page: int = 1,
    page_size: int = 50,
    status_filter: str | None = None,
    task_type: str | None = None,
    assignee_id: str | None = None,
    sprint: str | None = None,
    is_archived: bool | None = None,
    created_by: str | None = None,
) -> PaginatedTasks:
    query: dict = {}

    if status_filter is not None:
        query["status"] = status_filter
    if task_type is not None:
        query["task_type"] = task_type
    if assignee_id is not None:
        query["assignee_id"] = assignee_id
    if sprint is not None:
        query["sprint"] = sprint
    if is_archived is not None:
        query["is_archived"] = is_archived
    if created_by is not None:
        query["created_by"] = created_by

    total = await db[COLLECTION].count_documents(query)
    total_pages = max(1, math.ceil(total / page_size))

    skip = (page - 1) * page_size
    cursor = (
        db[COLLECTION]
        .find(query)
        .sort("created_at", -1)
        .skip(skip)
        .limit(page_size)
    )
    docs = await cursor.to_list(length=page_size)
    items = [TaskResponse(**doc) for doc in docs]

    return PaginatedTasks(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


async def update_task(
    db: AsyncIOMotorDatabase,
    task_id: str,
    data: TaskUpdate,
) -> TaskResponse:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    updates["updated_at"] = datetime.utcnow()

    result = await db[COLLECTION].find_one_and_update(
        {"_id": task_id},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
    )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    return TaskResponse(**result)


async def delete_task(
    db: AsyncIOMotorDatabase,
    task_id: str,
) -> None:
    result = await db[COLLECTION].delete_one({"_id": task_id})
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
