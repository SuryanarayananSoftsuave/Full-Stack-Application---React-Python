from enum import Enum

from fastapi import Depends, HTTPException, status

from app.dependencies.auth import get_current_active_user
from app.models.user import UserInDB


class Role(str, Enum):
    ADMIN = "admin"
    USER = "user"
    MODERATOR = "moderator"


class Permission(str, Enum):
    USER_READ = "user:read"
    USER_CREATE = "user:create"
    USER_UPDATE = "user:update"
    USER_DELETE = "user:delete"


class PermissionChecker:
    """
    FastAPI callable-class dependency that enforces role and permission checks.

    - Roles: the user must hold **at least one** of the required roles.
    - Permissions: the user must hold **all** required permissions.

    Usage::

        @router.get(
            "/admin-panel",
            dependencies=[Depends(PermissionChecker(required_roles=[Role.ADMIN]))],
        )
    """

    def __init__(
        self,
        required_roles: list[Role] | None = None,
        required_permissions: list[Permission] | None = None,
    ):
        self.required_roles = required_roles or []
        self.required_permissions = required_permissions or []

    async def __call__(
        self,
        user: UserInDB = Depends(get_current_active_user),
    ) -> UserInDB:
        if self.required_roles:
            if not any(role.value in user.roles for role in self.required_roles):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Insufficient role privileges",
                )

        if self.required_permissions:
            user_perms = set(user.permissions)
            missing = [p.value for p in self.required_permissions if p.value not in user_perms]
            if missing:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Missing permissions: {', '.join(missing)}",
                )

        return user
