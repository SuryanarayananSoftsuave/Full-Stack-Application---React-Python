# FastAPI Auth Backend

Production-grade authentication backend with JWT tokens stored in httponly cookies, role-based access control, and fine-grained permissions.

## Prerequisites

- Python 3.11+
- MongoDB running locally (default `mongodb://localhost:27017`)

## Setup

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS / Linux

# Install dependencies
pip install -r requirements.txt

# Copy env template and edit values
cp .env.example .env
```

## Run

```bash
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`.
Interactive docs at `http://localhost:8000/docs`.

## API Endpoints

| Method | Path                | Description                        | Auth Required      |
|--------|---------------------|------------------------------------|---------------------|
| POST   | `/api/auth/register`| Register a new user                | No                  |
| POST   | `/api/auth/login`   | Login (sets httponly cookies)       | No                  |
| POST   | `/api/auth/refresh` | Refresh tokens (reads cookie)      | refresh_token cookie|
| POST   | `/api/auth/logout`  | Clear auth cookies                 | No                  |
| GET    | `/api/auth/me`      | Get current user profile           | access_token cookie |

## Project Structure

```
backend/
├── app/
│   ├── main.py             # App factory, CORS, router mounting
│   ├── config.py           # Pydantic Settings (env-based)
│   ├── core/
│   │   ├── security.py     # Password hashing, JWT creation/decoding
│   │   └── permissions.py  # Role & Permission enums, PermissionChecker
│   ├── db/
│   │   └── mongodb.py      # Motor client, lifespan, get_database
│   ├── dependencies/
│   │   └── auth.py         # get_current_user, get_current_active_user
│   ├── models/
│   │   └── user.py         # Pydantic request/response/DB models
│   ├── routes/
│   │   └── auth.py         # Auth endpoints
│   └── services/
│       ├── auth_service.py # Registration, login, refresh logic
│       └── user_service.py # User lookup helpers
├── .env.example
├── requirements.txt
└── README.md
```

## Permission System

Use `PermissionChecker` as a FastAPI dependency on any route:

```python
from app.core.permissions import PermissionChecker, Role, Permission

@router.get(
    "/admin-only",
    dependencies=[Depends(PermissionChecker(required_roles=[Role.ADMIN]))],
)
async def admin_panel():
    ...

@router.delete(
    "/users/{user_id}",
    dependencies=[Depends(PermissionChecker(required_permissions=[Permission.USER_DELETE]))],
)
async def delete_user(user_id: str):
    ...
```
