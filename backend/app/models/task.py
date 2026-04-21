from datetime import datetime
from enum import Enum
from uuid import uuid4

from pydantic import BaseModel, Field


def _uuid() -> str:
    return str(uuid4())


class TaskStatus(str, Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    IN_REVIEW = "in_review"
    DONE = "done"


class TaskPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class TaskType(str, Enum):
    TASK = "task"
    USER_STORY = "user_story"
    BUG = "bug"


# ── Request models ───────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    status: TaskStatus = TaskStatus.TODO
    priority: TaskPriority = TaskPriority.MEDIUM
    task_type: TaskType = TaskType.TASK
    sprint: str | None = None
    assignee_id: str | None = None
    tags: list[str] = Field(default_factory=list)
    due_date: datetime | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    task_type: TaskType | None = None
    sprint: str | None = None
    assignee_id: str | None = None
    tags: list[str] | None = None
    due_date: datetime | None = None
    is_archived: bool | None = None


# ── Database document model ──────────────────────────────────────────────────

class TaskInDB(BaseModel):
    id: str = Field(default_factory=_uuid, alias="_id")
    title: str
    description: str = ""
    status: TaskStatus = TaskStatus.TODO
    priority: TaskPriority = TaskPriority.MEDIUM
    task_type: TaskType = TaskType.TASK
    sprint: str | None = None
    assignee_id: str | None = None
    assignee_name: str | None = None
    assignee_email: str | None = None
    assignee_department: str | None = None
    created_by: str
    tags: list[str] = Field(default_factory=list)
    due_date: datetime | None = None
    is_archived: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"populate_by_name": True}


# ── Response models ──────────────────────────────────────────────────────────

class TaskResponse(BaseModel):
    id: str = Field(alias="_id")
    title: str
    description: str
    status: TaskStatus
    priority: TaskPriority
    task_type: TaskType
    sprint: str | None
    assignee_id: str | None
    assignee_name: str | None = None
    assignee_email: str | None = None
    assignee_department: str | None = None
    created_by: str
    tags: list[str]
    due_date: datetime | None
    is_archived: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"populate_by_name": True}


class PaginatedTasks(BaseModel):
    items: list[TaskResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
