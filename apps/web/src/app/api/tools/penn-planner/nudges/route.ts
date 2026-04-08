import { NextResponse } from "next/server";
import { resolveIdentity } from "@/lib/resolveIdentity";
import { repositories } from "@/lib/container";
import { detectDeadlineStack } from "@/lib/pennPlanner/priorityEngine";
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
  const tasks = await getPlannerTasks(repositories.toolData, userId);
  const activeTasks = tasks.filter((t) => t.status !== "completed");

  const nudges: { type: string; message: string; taskIds: string[] }[] = [];

  const { isStacked, stackedTasks, message } = detectDeadlineStack(activeTasks);
  if (isStacked) {
    nudges.push({
      type: "deadline_stack",
      message,
      taskIds: stackedTasks.map((t) => t.id),
    });
  }

  const overdue = activeTasks.filter((t) => new Date(t.dueDate) < new Date());
  if (overdue.length > 0) {
    nudges.push({
      type: "risk_alert",
      message: `🔴 You have ${overdue.length} overdue task${overdue.length > 1 ? "s" : ""} that need immediate attention.`,
      taskIds: overdue.map((t) => t.id),
    });
  }

  const upcomingInterviews = activeTasks.filter(
    (t) =>
      t.type === "interview" &&
      new Date(t.dueDate).getTime() - Date.now() < 48 * 60 * 60 * 1000
  );

  if (upcomingInterviews.length > 0) {
    nudges.push({
      type: "risk_alert",
      message: `🎯 Interview coming up: "${upcomingInterviews[0]?.title}" - make sure your case prep is ready.`,
      taskIds: upcomingInterviews.map((t) => t.id),
    });
  }

  return withIdentityCookie(NextResponse.json({ nudges }), setCookie);
}
