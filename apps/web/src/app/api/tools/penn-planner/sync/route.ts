import { NextResponse } from "next/server";
import { resolveIdentity } from "@/lib/resolveIdentity";
import { repositories } from "@/lib/container";
import { fetchAllIntegrationTasks } from "@/lib/pennPlanner/integrations";
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

export async function POST(): Promise<NextResponse> {
  const { userId, setCookie } = await resolveIdentity();
  const existingTasks = await getPlannerTasks(repositories.toolData, userId);
  const allExternal = await fetchAllIntegrationTasks();

  let created = 0;
  let skipped = 0;

  const nextTasks = [...existingTasks];
  const nowIso = new Date().toISOString();

  for (const ext of allExternal) {
    const duplicate = nextTasks.find(
      (t) => t.title === ext.title && t.source === ext.source
    );

    if (duplicate) {
      skipped++;
      continue;
    }

    const task: PennPlannerTask = {
      id: crypto.randomUUID(),
      title: ext.title,
      description: ext.description ?? null,
      source: ext.source,
      type: ext.type,
      dueDate: ext.dueDate,
      estimatedMinutes: ext.estimatedMinutes ?? null,
      priority: 0,
      priorityScore: 0,
      status: "pending",
      course: ext.course ?? null,
      company: ext.company ?? null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    nextTasks.push(task);
    created++;
  }

  await savePlannerTasks(repositories.toolData, userId, nextTasks);

  return withIdentityCookie(
    NextResponse.json({
      success: true,
      created,
      skipped,
      total: allExternal.length,
    }),
    setCookie
  );
}
