import { NextRequest, NextResponse } from "next/server";
import { resolveIdentity } from "@/lib/resolveIdentity";
import { repositories } from "@/lib/container";
import { getPlannerTasks, savePlannerTasks } from "@/lib/pennPlanner/state";
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const { userId, setCookie } = await resolveIdentity();
  const body = (await req.json()) as Partial<PennPlannerTask>;

  const tasks = await getPlannerTasks(repositories.toolData, userId);
  const idx = tasks.findIndex((t) => t.id === params.id);
  if (idx < 0) {
    return withIdentityCookie(
      NextResponse.json({ error: "Task not found" }, { status: 404 }),
      setCookie
    );
  }

  const existing = tasks[idx];
  if (!existing) {
    return withIdentityCookie(
      NextResponse.json({ error: "Task not found" }, { status: 404 }),
      setCookie
    );
  }
  const updated: PennPlannerTask = {
    ...existing,
    title: body.title ?? existing.title,
    description: body.description ?? existing.description,
    estimatedMinutes:
      typeof body.estimatedMinutes === "number"
        ? body.estimatedMinutes
        : existing.estimatedMinutes,
    status: (body.status as PennPlannerTask["status"]) ?? existing.status,
    updatedAt: new Date().toISOString(),
  };

  tasks[idx] = updated;
  await savePlannerTasks(repositories.toolData, userId, tasks);
  return withIdentityCookie(NextResponse.json(updated), setCookie);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const { userId, setCookie } = await resolveIdentity();
  const tasks = await getPlannerTasks(repositories.toolData, userId);
  const filtered = tasks.filter((t) => t.id !== params.id);
  await savePlannerTasks(repositories.toolData, userId, filtered);
  return withIdentityCookie(NextResponse.json({ success: true }), setCookie);
}
