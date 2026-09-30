import type { UserRepository, GoogleAccountInput } from "@penntools/core/repositories";
import type { User, UserId } from "@penntools/core/types";
import type { PrismaClient } from "@prisma/client";

function toUser(record: {
  id: string;
  createdAt: Date;
  name: string | null;
  email: string | null;
  image: string | null;
  pennId: string | null;
}): User {
  return {
    id: record.id,
    createdAt: record.createdAt,
    name: record.name,
    email: record.email,
    image: record.image,
    pennId: record.pennId,
  };
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: PrismaClient) {}

  async findById(id: UserId): Promise<User | null> {
    const record = await this.db.user.findUnique({ where: { id } });
    return record ? toUser(record) : null;
  }

  async upsertByGoogleAccount(input: GoogleAccountInput): Promise<User> {
    const profile = { name: input.name, email: input.email, image: input.image };
    const record = await this.db.user.upsert({
      where: { googleId: input.googleId },
      update: profile,
      create: { googleId: input.googleId, ...profile },
    });
    return toUser(record);
  }
}
