import { useAuth } from "../../hooks/useAuth";
import { TasksList } from "./TasksList";

export function MyTasksPage() {
  const { user } = useAuth();

  // ProtectedRoute already gates access, so user should always be set here.
  // Render nothing while the auth check is still resolving.
  if (!user) return null;

  return <TasksList title="My Tasks" lockedAssigneeId={user.id || user._id} excludeTypeFilter="user_story" />;
}
