import type { Admin, AdminRepository } from "@penntools/core/repositories";
import type { PrismaClient } from "@prisma/client";

export class PrismaAdminRepository implements AdminRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(): Promise<Admin[]> {
    return this.db.admin.findMany({ orderBy: { addedAt: "asc" } });
  }

  async isAdmin(email: string): Promise<boolean> {
    return (await this.db.admin.count({ where: { email: email.toLowerCase() } })) > 0;
  }

  async add(email: string, addedBy: string): Promise<void> {
    await this.db.admin.upsert({
      where: { email: email.toLowerCase() },
      update: {},
      create: { email: email.toLowerCase(), addedBy: addedBy.toLowerCase() },
    });
  }

  async remove(email: string): Promise<void> {
    await this.db.admin.deleteMany({ where: { email: email.toLowerCase() } });
  }
}
