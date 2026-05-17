import { getAllTasks } from "../lib/storage";
import type { Task } from "../lib/types";

interface TaskItemProps {
  task: Task;
}

function TaskItem({ task }: TaskItemProps) {
  return (
    <li>
      <span>{task.id}. {task.title}</span>
      {task.completed && <span> (done)</span>}
    </li>
  );
}

export default function HomePage() {
  const tasks = getAllTasks();
  return (
    <main>
      <h1>Tasks</h1>
      {tasks.length === 0 ? (
        <p>No tasks yet. POST to /api/tasks to create one.</p>
      ) : (
        <ul>
          {tasks.map((t) => (
            <TaskItem key={t.id} task={t} />
          ))}
        </ul>
      )}
    </main>
  );
}
