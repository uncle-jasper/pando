import { db } from "./db";
import { settings } from "./schema";

export async function getOrCreateSettings() {
  const rows = await db.select().from(settings).limit(1);
  if (rows.length > 0) return rows[0];
  const [row] = await db.insert(settings).values({}).returning();
  return row;
}
