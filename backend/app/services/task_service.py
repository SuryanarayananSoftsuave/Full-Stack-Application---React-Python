import math
from datetime import datetime
import re

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
from app.services.user_service import get_user_by_id


COLLECTION = "tasks"


async def _resolve_assignee(db: AsyncIOMotorDatabase, assignee_id: str | None) -> dict:
    if not assignee_id:
        return {"assignee_name": None, "assignee_email": None, "assignee_department": None}
    user = await get_user_by_id(db, assignee_id)
    if user is None:
        return {"assignee_name": None, "assignee_email": None, "assignee_department": None}
    return {
        "assignee_name": user.full_name,
        "assignee_email": user.email,
        "assignee_department": user.department,
    }


async def create_task(
    db: AsyncIOMotorDatabase,
    data: TaskCreate,
    user_id: str,
) -> TaskResponse:
    assignee_info = await _resolve_assignee(db, data.assignee_id)
    task = TaskInDB(
        **data.model_dump(),
        **assignee_info,
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
    priority: str | None = None,
    title: str | None = None,
    exclude_task_type: str | None = None,
) -> PaginatedTasks:
    query: dict = {}

    if status_filter is not None:
        query["status"] = status_filter
    if task_type is not None:
        if "," in task_type:
            query["task_type"] = {"$in": [t.strip() for t in task_type.split(",")]}
        else:
            query["task_type"] = task_type
    if assignee_id == "null":
        # Sentinel for "unassigned" -- matches both explicit null and missing field.
        query["assignee_id"] = None
    elif assignee_id is not None:
        query["assignee_id"] = assignee_id
    if sprint is not None:
        query["sprint"] = sprint
    if is_archived is not None:
        query["is_archived"] = is_archived
    if created_by is not None:
        query["created_by"] = created_by
    if title:
        query["title"] = {"$regex": re.escape(title), "$options": "i"}
    if priority:
        query["priority"] = priority
    if exclude_task_type:
        excluded = [t.strip() for t in exclude_task_type.split(",")]
        if "task_type" in query:
            existing = query["task_type"]
            if isinstance(existing, dict) and "$in" in existing:
                query["task_type"]["$in"] = [
                    t for t in existing["$in"] if t not in excluded
                ]
            else:
                if existing in excluded:
                    query["task_type"] = {"$nin": excluded}
        else:
            query["task_type"] = {"$nin": excluded}

    total = await db[COLLECTION].count_documents(query)
    total_pages = max(1, math.ceil(total / page_size))

    skip = (page - 1) * page_size
    cursor = (
        db[COLLECTION]
        .find(query)
        .sort("updated_at", -1)
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

    if "assignee_id" in updates:
        assignee_info = await _resolve_assignee(db, updates["assignee_id"])
        updates.update(assignee_info)

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


async def list_sprints(db: AsyncIOMotorDatabase) -> list[str]:
    sprints = await db[COLLECTION].distinct("sprint")
    return sorted(s for s in sprints if s)


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
