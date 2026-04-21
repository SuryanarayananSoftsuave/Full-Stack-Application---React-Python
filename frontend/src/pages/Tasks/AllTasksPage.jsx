import { TasksList } from "./TasksList";

export function AllTasksPage() {
  return <TasksList title="All Tasks" excludeTypeFilter="user_story" />;
}
