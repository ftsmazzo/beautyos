import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { databaseReady, db } from "@/db/client";

const COOKIE = "beautyos_session";
const DAYS = 14;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "balcao" | "administrador" | "profissional" | "cliente";
  accountId: string;
  accountName: string;
};

export async function currentUser(): Promise<SessionUser | null> {
  await databaseReady();
  const cookie = (await cookies()).get(COOKIE)?.value;
  if (!cookie) return null;
  const rows = await db()<SessionUser[]>`
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.account_id AS "accountId",
      a.name AS "accountName"
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN accounts a ON a.id = u.account_id
    WHERE s.id = ${cookie}
      AND s.expires_at > now()
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function startSession(userId: string) {
  await databaseReady();
  const id = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + DAYS * 24 * 60 * 60 * 1000);
  await db()`
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES (${id}, ${userId}, ${expires})
  `;
  (await cookies()).set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function endSession() {
  const cookie = (await cookies()).get(COOKIE)?.value;
  if (cookie) {
    await databaseReady();
    await db()`DELETE FROM sessions WHERE id = ${cookie}`;
  }
  (await cookies()).delete(COOKIE);
}
