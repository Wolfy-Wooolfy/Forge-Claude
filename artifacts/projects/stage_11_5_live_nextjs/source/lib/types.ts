export interface Task {
  id: number;
  title: string;
  completed: boolean;
  createdAt: string;
}

export type CreateTaskInput = Pick<Task, "title">;

export type TaskId = Task["id"];

export type TaskList = Task[];

export type TaskFilter = "all" | "active" | "completed";
