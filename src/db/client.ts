import postgres from "postgres";

let sql: ReturnType<typeof postgres> | null = null;
let ready: Promise<void> | null = null;

export function db() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL ausente");
  }
  if (!sql) {
    sql = postgres(url, { max: 5 });
  }
  return sql;
}

export function databaseReady() {
  if (!ready) {
    ready = ensureSchema().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

async function ensureSchema() {
  const sql = db();
  await sql`
    CREATE TABLE IF NOT EXISTS accounts (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name text NOT NULL,
      email text NOT NULL,
      password_hash text NOT NULL,
      role text NOT NULL CHECK (role IN ('balcao', 'administrador', 'profissional', 'cliente')),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (account_id, email)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS users_email_idx ON users (lower(email))`;
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}
