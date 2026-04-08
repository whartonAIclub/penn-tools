import { NextRequest, NextResponse } from "next/server";
import { resolveIdentity } from "@/lib/resolveIdentity";
import { repositories } from "@/lib/container";
import { getPlannerTasks, savePlannerTasks } from "@/lib/pennPlanner/state";
import { prioritizeTasks } from "@/lib/pennPlanner/priorityEngine";
import type { PennPlannerTask } from "@/lib/pennPlanner/types";

function withIdentityCookie(
  response: NextResponse,
  setCookie?: { name: string; value: string; httpOnly: boolean; path: string }
) {
  if (setCookie) {
    response.cookies.set(setCookie.name, setCookie.value, {
      httpOnly: setCookie.httpOnly,
      path: setCookie.path,
    });
  }
  return response;
}

export async function GET(): Promise<NextResponse> {
  const { userId, setCookie } = await resolveIdentity();
  const tasks = await getPlannerTasks(repositories.toolData, userId);
  return withIdentityCookie(NextResponse.json(prioritizeTasks(tasks)), setCookie);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId, setCookie } = await resolveIdentity();
  const body = (await req.json()) as Partial<PennPlannerTask>;

  if (!body.title || !body.dueDate) {
    return withIdentityCookie(
      NextResponse.json({ error: "title and dueDate are required" }, { status: 400 }),
      setCookie
    );
  }

  const dueDate = new Date(body.dueDate);
  if (Number.isNaN(dueDate.getTime())) {
    return withIdentityCookie(
      NextResponse.json({ error: "Invalid dueDate" }, { status: 400 }),
      setCookie
    );
  }

  const nowIso = new Date().toISOString();
  const task: PennPlannerTask = {
    id: crypto.randomUUID(),
    title: body.title,
    description: body.description ?? null,
    source: (body.source as PennPlannerTask["source"]) ?? "manual",
    type: body.type ?? "other",
    dueDate: dueDate.toISOString(),
    estimatedMinutes:
      typeof body.estimatedMinutes === "number"
        ? body.estimatedMinutes
        : body.estimatedMinutes
          ? Number(body.estimatedMinutes)
          : null,
    priority: 0,
    priorityScore: 0,
    status: "pending",
    course: body.course ?? null,
    company: body.company ?? null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const tasks = await getPlannerTasks(repositories.toolData, userId);
  tasks.push(task);
  await savePlannerTasks(repositories.toolData, userId, tasks);

  return withIdentityCookie(NextResponse.json(task, { status: 201 }), setCookie);
}
