import postgres from "postgres";

export interface ReflectionItem {
  event_id: string;
  reflection_text: string;
  updated_at: Date;
}

export interface ListReflectionsOptions {
  databaseUrl: string;
  userId: string;
  eventId?: string;
}

export interface UpsertReflectionOptions {
  databaseUrl: string;
  userId: string;
  eventId: string;
  reflectionText: string;
}

export interface DeleteReflectionOptions {
  databaseUrl: string;
  userId: string;
  eventId: string;
}

export async function listReflections(
  options: ListReflectionsOptions
): Promise<ReflectionItem[]> {
  const sql = postgres(options.databaseUrl, { max: 3 });

  try {
    const rows = await sql<ReflectionItem[]>`
      SELECT event_id, reflection_text, updated_at
      FROM event_reflections
      WHERE user_id = ${options.userId}
      ${options.eventId ? sql`AND event_id = ${options.eventId}` : sql``}
      ORDER BY updated_at DESC
    `;

    return rows;
  } finally {
    await sql.end();
  }
}

export async function upsertReflection(
  options: UpsertReflectionOptions
): Promise<ReflectionItem> {
  const sql = postgres(options.databaseUrl, { max: 3 });

  try {
    const rows = await sql<ReflectionItem[]>`
      INSERT INTO event_reflections (user_id, event_id, reflection_text)
      VALUES (${options.userId}, ${options.eventId}, ${options.reflectionText})
      ON CONFLICT (user_id, event_id)
      DO UPDATE SET
        reflection_text = EXCLUDED.reflection_text,
        updated_at = NOW()
      RETURNING event_id, reflection_text, updated_at
    `;

    const [row] = rows;
    if (!row) {
      throw new Error("Failed to upsert reflection.");
    }

    return row;
  } finally {
    await sql.end();
  }
}

export async function deleteReflection(
  options: DeleteReflectionOptions
): Promise<boolean> {
  const sql = postgres(options.databaseUrl, { max: 3 });

  try {
    const rows = await sql<Array<{ event_id: string }>>`
      DELETE FROM event_reflections
      WHERE user_id = ${options.userId}
        AND event_id = ${options.eventId}
      RETURNING event_id
    `;

    return rows.length > 0;
  } finally {
    await sql.end();
  }
}
