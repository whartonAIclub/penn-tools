import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { prioritizeTasks, generateDailySummary } from "@/lib/priority-engine";

export async function GET() {
  try {
    const tasks = await prisma.task.findMany({
      orderBy: { dueDate: "asc" },
    });

    const prioritized = prioritizeTasks(tasks);
    const summary = await generateDailySummary(prioritized);

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Summary error:", error);
    return NextResponse.json({ summary: "Focus on your top priority first." });
  }
}
