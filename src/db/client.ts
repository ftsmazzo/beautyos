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
  await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS referral_commission_percent integer NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS staff_consumption_percent integer NOT NULL DEFAULT 30`;
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
  await sql`
    CREATE TABLE IF NOT EXISTS services (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name text NOT NULL,
      notes text,
      active boolean NOT NULL DEFAULT true,
      bookable boolean NOT NULL DEFAULT true,
      duration_min integer NOT NULL,
      price_cents integer NOT NULL,
      commission_percent integer NOT NULL DEFAULT 0,
      return_days integer,
      extras_goal boolean NOT NULL DEFAULT false,
      menu_group text,
      next_price_cents integer,
      next_price_on date,
      price_changed_on date,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS services_account_idx ON services (account_id)`;
  await sql`
    CREATE TABLE IF NOT EXISTS professionals (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      user_id uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
      name text NOT NULL,
      nickname text,
      phone text,
      email text,
      notes text,
      active boolean NOT NULL DEFAULT true,
      bookable boolean NOT NULL DEFAULT true,
      column_color text NOT NULL DEFAULT '#1f6f78',
      birth_date date,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS professionals_account_idx ON professionals (account_id)`;
  await sql`
    CREATE TABLE IF NOT EXISTS professional_services (
      professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
      service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      price_cents integer,
      duration_min integer,
      commission_percent integer,
      PRIMARY KEY (professional_id, service_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS professional_hours (
      id uuid PRIMARY KEY,
      professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
      weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      period smallint NOT NULL CHECK (period IN (1, 2)),
      start_time text NOT NULL,
      end_time text NOT NULL,
      valid_from date,
      valid_until date
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS professional_hours_pro_idx ON professional_hours (professional_id)`;
  await sql`
    CREATE TABLE IF NOT EXISTS suppliers (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name text NOT NULL,
      phone text,
      cnpj text,
      city text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS suppliers_account_idx ON suppliers (account_id)`;
  await sql`
    CREATE TABLE IF NOT EXISTS products (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name text NOT NULL,
      brand text,
      category text,
      notes text,
      barcode text,
      active boolean NOT NULL DEFAULT true,
      sells_to_client boolean NOT NULL DEFAULT true,
      is_supply boolean NOT NULL DEFAULT false,
      sale_price_cents integer NOT NULL,
      commission_percent integer NOT NULL DEFAULT 0,
      cost_cents integer NOT NULL DEFAULT 0,
      min_qty integer NOT NULL DEFAULT 0,
      supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
      staff_price_cents integer,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS products_account_idx ON products (account_id)`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_uidx
    ON products (account_id, barcode) WHERE barcode IS NOT NULL
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      qty integer NOT NULL CHECK (qty <> 0),
      reason text NOT NULL CHECK (reason IN ('venda', 'uso', 'consumo', 'compra', 'ajuste', 'conferencia')),
      note text,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON stock_movements (product_id)`;
  await sql`
    CREATE TABLE IF NOT EXISTS product_components (
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      component_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      qty integer NOT NULL CHECK (qty > 0),
      PRIMARY KEY (product_id, component_id),
      CHECK (product_id <> component_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS service_discounts (
      id uuid PRIMARY KEY,
      service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      start_time text,
      end_time text,
      mode text NOT NULL CHECK (mode IN ('valor', 'percentual')),
      amount integer NOT NULL CHECK (amount >= 0)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS service_supplies (
      service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      qty integer NOT NULL CHECK (qty > 0),
      PRIMARY KEY (service_id, product_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS clients (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name text NOT NULL,
      phone text NOT NULL,
      email text,
      birth_date date,
      notes text,
      channel text NOT NULL DEFAULT 'nao_informado'
        CHECK (channel IN ('instagram', 'whatsapp', 'indicacao', 'porta', 'google', 'nao_informado')),
      from_outside boolean NOT NULL DEFAULT false,
      incomplete boolean NOT NULL DEFAULT false,
      landline text,
      cpf text,
      rg text,
      sex text,
      address text,
      referrer_professional_id uuid REFERENCES professionals(id) ON DELETE SET NULL,
      referrer_client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
      referral_commission_percent integer,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS clients_account_idx ON clients (account_id)`;
  await sql`
    CREATE TABLE IF NOT EXISTS packages (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name text NOT NULL,
      notes text,
      for_sale boolean NOT NULL DEFAULT true,
      validity_days integer NOT NULL CHECK (validity_days > 0),
      sale_commission_percent integer,
      price_cents integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS packages_account_idx ON packages (account_id)`;
  await sql`
    CREATE TABLE IF NOT EXISTS package_items (
      id uuid PRIMARY KEY,
      package_id uuid NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
      position integer NOT NULL,
      kind text NOT NULL CHECK (kind IN ('service', 'product')),
      service_id uuid REFERENCES services(id),
      product_id uuid REFERENCES products(id),
      qty integer NOT NULL DEFAULT 1 CHECK (qty > 0),
      internal_price_cents integer NOT NULL CHECK (internal_price_cents >= 0)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS package_items_package_idx ON package_items (package_id)`;
}
