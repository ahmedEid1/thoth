import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

/**
 * Returns the DB User row for the current Clerk session,
 * creating one lazily if the webhook hasn't fired yet (race protection).
 */
export async function getCurrentUser() {
  const { userId } = await auth();
  if (!userId) return null;

  const existing = await db.user.findUnique({ where: { clerkId: userId } });
  if (existing) return existing;

  return db.user.create({
    data: { clerkId: userId, email: `${userId}@pending.local` },
  });
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}
