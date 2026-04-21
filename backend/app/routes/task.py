from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db.mongodb import get_database
from app.dependencies.auth import get_current_active_user
from app.models.task import (
    PaginatedTasks,
    TaskCreate,
    TaskResponse,
    TaskUpdate,
)
from app.models.user import MessageResponse, UserInDB
from app.services import task_service

router = APIRouter(prefix="/tasks", tags=["Tasks"])


@router.post(
    "",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new task",
)
async def create(
    data: TaskCreate,
    user: UserInDB = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    return await task_service.create_task(db, data, user.id)


@router.get(
    "",
    response_model=PaginatedTasks,
    summary="List tasks with pagination and filters",
)
async def list_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    task_type: str | None = Query(None),
    assignee_id: str | None = Query(None),
    sprint: str | None = Query(None),
    is_archived: bool | None = Query(None),
    created_by: str | None = Query(None),
    priority: str | None = Query(None),
    title: str | None = Query(None),
    _user: UserInDB = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    return await task_service.list_tasks(
        db,
        page=page,
        page_size=page_size,
        status_filter=status_filter,
        task_type=task_type,
        assignee_id=assignee_id,
        sprint=sprint,
        is_archived=is_archived,
        created_by=created_by,
        priority=priority,
        title=title,
    )


@router.get(
    "/{task_id}",
    response_model=TaskResponse,
    summary="Get a single task by ID",
)
async def get_task(
    task_id: str,
    _user: UserInDB = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    return await task_service.get_task_by_id(db, task_id)


@router.patch(
    "/{task_id}",
    response_model=TaskResponse,
    summary="Update a task by ID",
)
async def update(
    task_id: str,
    data: TaskUpdate,
    _user: UserInDB = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    return await task_service.update_task(db, task_id, data)


@router.delete(
    "/{task_id}",
    response_model=MessageResponse,
    summary="Delete a task by ID",
)
async def delete(
    task_id: str,
    _user: UserInDB = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    await task_service.delete_task(db, task_id)
    return MessageResponse(message="Task deleted")
