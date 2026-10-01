"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { databaseReady, db } from "@/db/client";
import { hashPassword, verifyPassword } from "@/auth/password";
import { currentUser, endSession, startSession } from "@/auth/session";

const ROLES = ["balcao", "administrador", "profissional", "cliente"] as const;

function cleanEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function createHouse(formData: FormData) {
  const house = String(formData.get("house") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = cleanEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  if (house.length < 2 || name.length < 2 || !email.includes("@") || password.length < 8) {
    redirect("/?erro=dados");
  }

  await databaseReady();
  const existing = await db()`SELECT id FROM accounts LIMIT 1`;
  if (existing.length > 0) {
    redirect("/entrar");
  }

  const accountId = randomUUID();
  const userId = randomUUID();
  await db()`
    INSERT INTO accounts (id, name) VALUES (${accountId}, ${house})
  `;
  await db()`
    INSERT INTO users (id, account_id, name, email, password_hash, role)
    VALUES (${userId}, ${accountId}, ${name}, ${email}, ${hashPassword(password)}, 'administrador')
  `;
  await startSession(userId);
  redirect("/inicio");
}

export async function login(formData: FormData) {
  const email = cleanEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  await databaseReady();
  const rows = await db()<
    { id: string; passwordHash: string }[]
  >`
    SELECT id, password_hash AS "passwordHash"
    FROM users
    WHERE lower(email) = ${email}
  `;
  const match = rows.find((row) => verifyPassword(password, row.passwordHash));
  if (!match) {
    redirect("/entrar?erro=credenciais");
  }
  await startSession(match.id);
  redirect("/inicio");
}

export async function logout() {
  await endSession();
  redirect("/entrar");
}

export async function createAccess(formData: FormData) {
  const user = await currentUser();
  if (!user || user.role !== "administrador") {
    redirect("/inicio");
  }
  const name = String(formData.get("name") ?? "").trim();
  const email = cleanEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "");
  if (name.length < 2 || !email.includes("@") || password.length < 8 || !ROLES.includes(role as (typeof ROLES)[number])) {
    redirect("/acesso?erro=dados");
  }
  await databaseReady();
  try {
    await db()`
      INSERT INTO users (id, account_id, name, email, password_hash, role)
      VALUES (${randomUUID()}, ${user.accountId}, ${name}, ${email}, ${hashPassword(password)}, ${role})
    `;
  } catch {
    redirect("/acesso?erro=email");
  }
  redirect("/acesso");
}
