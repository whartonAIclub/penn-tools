import { NextResponse } from "next/server";
import { resolveIdentity } from "@/lib/resolveIdentity";
import { llm, repositories } from "@/lib/container";
import { generateDailySummary, prioritizeTasks } from "@/lib/pennPlanner/priorityEngine";
import { getPlannerTasks } from "@/lib/pennPlanner/state";

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

  try {
    const tasks = await getPlannerTasks(repositories.toolData, userId);
    const prioritized = prioritizeTasks(tasks);
    const summary = await generateDailySummary(prioritized, llm);
    return withIdentityCookie(NextResponse.json({ summary }), setCookie);
  } catch {
    return withIdentityCookie(
      NextResponse.json({ summary: "Focus on your top priority first." }),
      setCookie
    );
  }
}
