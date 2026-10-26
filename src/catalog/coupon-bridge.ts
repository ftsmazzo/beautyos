"use server";

import { randomBytes } from "crypto";
import { requireOperator } from "@/catalog/access";
import { databaseReady, db } from "@/db/client";

const TOKEN = /^[a-f0-9]{32}$/;

export async function startCouponLink() {
  const user = await requireOperator();
  const token = randomBytes(16).toString("hex");
  const sql = db();
  await sql`DELETE FROM coupon_drops WHERE expires_at < now()`;
  await sql`
    INSERT INTO coupon_drops (token, account_id, expires_at)
    VALUES (${token}, ${user.accountId}, now() + interval '10 minutes')
  `;
  return token;
}

export async function couponLinkOpen(token: string) {
  await databaseReady();
  if (!TOKEN.test(token)) return false;
  const rows = await db()`
    SELECT token FROM coupon_drops
    WHERE token = ${token} AND expires_at > now()
  `;
  return rows.length > 0;
}

export async function sendCouponPhoto(token: string, jpeg: string, qr: string) {
  await databaseReady();
  if (!TOKEN.test(token)) return { ok: false as const };
  const raw = jpeg.replace(/^data:image\/jpeg;base64,/, "");
  if (raw.length < 100 || raw.length > 1_200_000) return { ok: false as const };
  const photo = Buffer.from(raw, "base64");
  if (photo.length < 80 || photo.length > 900_000) return { ok: false as const };
  const code = qr.trim().slice(0, 1500);
  const updated = await db()`
    UPDATE coupon_drops
    SET photo = ${photo}, qr = ${code}
    WHERE token = ${token} AND expires_at > now()
    RETURNING token
  `;
  return updated.length > 0 ? { ok: true as const } : { ok: false as const };
}

export async function pullCouponShot(token: string) {
  const user = await requireOperator();
  if (!TOKEN.test(token)) return null;
  const rows = await db()`
    SELECT photo, qr FROM coupon_drops
    WHERE token = ${token}
      AND account_id = ${user.accountId}
      AND photo IS NOT NULL
      AND expires_at > now()
  `;
  const row = rows[0] as { photo: Buffer | Uint8Array; qr: string | null } | undefined;
  if (!row) return null;
  await db()`DELETE FROM coupon_drops WHERE token = ${token} AND account_id = ${user.accountId}`;
  const bytes = Buffer.isBuffer(row.photo) ? row.photo : Buffer.from(row.photo);
  return { photo: `data:image/jpeg;base64,${bytes.toString("base64")}`, qr: String(row.qr ?? "") };
}
