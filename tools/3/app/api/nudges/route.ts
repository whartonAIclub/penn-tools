import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { detectDeadlineStack } from "@/lib/priority-engine";

export async function GET() {
  try {
    const tasks = await prisma.task.findMany({
      where: { status: { not: "completed" } },
      orderBy: { dueDate: "asc" },
    });

    const nudges: { type: string; message: string; taskIds: string[] }[] = [];

    // Deadline stacking detection
    const { isStacked, stackedTasks, message } = detectDeadlineStack(tasks);
    if (isStacked) {
      nudges.push({
        type: "deadline_stack",
        message,
        taskIds: stackedTasks.map((t) => t.id),
      });
    }

    // Overdue tasks alert
    const overdue = tasks.filter((t) => new Date(t.dueDate) < new Date());
    if (overdue.length > 0) {
      nudges.push({
        type: "risk_alert",
        message: `🔴 You have ${overdue.length} overdue task${overdue.length > 1 ? "s" : ""} that need immediate attention.`,
        taskIds: overdue.map((t) => t.id),
      });
    }

    // Interview upcoming
    const upcomingInterviews = tasks.filter(
      (t) =>
        t.type === "interview" &&
        new Date(t.dueDate).getTime() - Date.now() < 48 * 60 * 60 * 1000
    );
    if (upcomingInterviews.length > 0) {
      nudges.push({
        type: "risk_alert",
        message: `🎯 Interview coming up: "${upcomingInterviews[0].title}" — make sure your case prep is ready.`,
        taskIds: upcomingInterviews.map((t) => t.id),
      });
    }

    return NextResponse.json({ nudges });
  } catch (error) {
    console.error("Nudge error:", error);
    return NextResponse.json({ error: "Failed to get nudges" }, { status: 500 });
  }
}
