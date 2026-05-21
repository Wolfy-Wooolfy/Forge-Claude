import { NextRequest, NextResponse } from "next/server";
import { getAllTasks, createTask } from "../../../../lib/storage";
import type { CreateTaskInput } from "../../../../lib/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const tasks = getAllTasks();
    return NextResponse.json({ tasks, count: tasks.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "request body must be valid JSON" },
      { status: 400 }
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("title" in body) ||
    typeof (body as CreateTaskInput).title !== "string"
  ) {
    return NextResponse.json(
      { error: "title is required and must be a string" },
      { status: 422 }
    );
  }

  const input = body as CreateTaskInput;
  const trimmed = input.title.trim();
  if (trimmed.length === 0) {
    return NextResponse.json(
      { error: "title must not be empty" },
      { status: 422 }
    );
  }

  const task = createTask({ title: trimmed });
  return NextResponse.json({ task }, { status: 201 });
}
