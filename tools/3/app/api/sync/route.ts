import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchAllIntegrationTasks } from "@/lib/integrations";

export async function POST() {
  try {
    const allExternal = await fetchAllIntegrationTasks();

    let created = 0;
    let skipped = 0;

    for (const ext of allExternal) {
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
