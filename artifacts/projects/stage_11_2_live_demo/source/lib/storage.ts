import type { Task, CreateTaskInput } from "./types";

let nextId = 1;
const tasks: Task[] = [];

export function getAllTasks(): Task[] {
  return [...tasks];
}

export function getTaskById(id: number): Task | undefined {
  return tasks.find((t) => t.id === id);
}

export function createTask(input: CreateTaskInput): Task {
  const task: Task = {
    id: nextId++,
    title: input.title,
    completed: false,
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  return task;
}

export function completeTask(id: number): Task | null {
  const task = tasks.find((t) => t.id === id);
  if (!task) return null;
  task.completed = true;
  return task;
}

export function resetStore(): void {
  tasks.length = 0;
  nextId = 1;
}
