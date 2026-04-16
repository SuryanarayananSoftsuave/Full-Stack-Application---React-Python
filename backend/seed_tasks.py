"""Seed 100 test tasks into MongoDB."""

import random
from datetime import datetime, timedelta
from uuid import uuid4

from pymongo import MongoClient

STATUSES = ["todo", "in_progress", "in_review", "done"]
PRIORITIES = ["low", "medium", "high", "critical"]
TASK_TYPES = ["task", "user_story", "bug"]
SPRINTS = ["Sprint 1", "Sprint 2", "Sprint 3", "Sprint 4", None]

TITLES = [
    "Set up CI/CD pipeline",
    "Fix login redirect loop",
    "Design user profile page",
    "Write unit tests for auth",
    "Implement dark mode toggle",
    "Optimize database queries",
    "Add email verification",
    "Create API documentation",
    "Refactor sidebar component",
    "Migrate to TypeScript",
    "Add search functionality",
    "Fix pagination off-by-one",
    "Implement file upload",
    "Add rate limiting",
    "Set up error monitoring",
    "Create onboarding flow",
    "Build notification system",
    "Add role management UI",
    "Optimize bundle size",
    "Fix mobile responsiveness",
]

client = MongoClient("mongodb://localhost:27017")
db = client["fastapi_auth"]

user = db["users"].find_one()
if not user:
    print("No users found. Register a user first, then run this script.")
    raise SystemExit(1)

user_id = user["_id"]
print(f"Using user: {user.get('email', user_id)}")

tasks = []
for i in range(100):
    now = datetime.utcnow() - timedelta(days=random.randint(0, 30), hours=random.randint(0, 23))
    tasks.append({
        "_id": str(uuid4()),
        "title": f"{random.choice(TITLES)} #{i + 1}",
        "description": f"Auto-generated test task number {i + 1}.",
        "status": random.choice(STATUSES),
        "priority": random.choice(PRIORITIES),
        "task_type": random.choice(TASK_TYPES),
        "sprint": random.choice(SPRINTS),
        "assignee_id": user_id if random.random() > 0.3 else None,
        "created_by": user_id,
        "tags": random.sample(["frontend", "backend", "devops", "testing", "design", "docs"], k=random.randint(0, 3)),
        "due_date": (datetime.utcnow() + timedelta(days=random.randint(1, 60))).isoformat() if random.random() > 0.4 else None,
        "is_archived": False,
        "created_at": now,
        "updated_at": now,
    })

result = db["tasks"].insert_many(tasks)
print(f"Inserted {len(result.inserted_ids)} tasks.")
client.close()
