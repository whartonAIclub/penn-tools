import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMockCanvasTasks, getMockCareerPathTasks } from "@/lib/mock-data";

export async function POST() {
  try {
    const canvasTasks = getMockCanvasTasks();
    const careerPathTasks = getMockCareerPathTasks();
    const allExternal = [...canvasTasks, ...careerPathTasks];

    let created = 0;
    let skipped = 0;

    for (const ext of allExternal) {
      // Check if already synced (by title + source to avoid duplicates)
      const existing = await prisma.task.findFirst({
        where: { title: ext.title, source: ext.source },
      });

      if (!existing) {
        await prisma.task.create({
          data: {
            title: ext.title,
            description: ext.description,
            source: ext.source,
            type: ext.type,
            dueDate: ext.dueDate,
            estimatedMinutes: ext.estimatedMinutes,
            course: ext.course,
            company: ext.company,
            status: "pending",
          },
        });
        created++;
      } else {
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      created,
      skipped,
      total: allExternal.length,
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
