import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { prioritizeTasks } from "@/lib/priority-engine";

export async function GET() {
  try {
    const tasks = await prisma.task.findMany({
      orderBy: { dueDate: "asc" },
    });

    const prioritized = prioritizeTasks(tasks);
    return NextResponse.json(prioritized);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const task = await prisma.task.create({
      data: {
        title: body.title,
        description: body.description,
        source: body.source ?? "manual",
        type: body.type ?? "other",
        dueDate: new Date(body.dueDate),
        estimatedMinutes: body.estimatedMinutes ? Number(body.estimatedMinutes) : undefined,
        course: body.course,
        company: body.company,
        status: "pending",
      },
    });
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
