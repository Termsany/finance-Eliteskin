-- المتابعة المالية v2: read-only mirror of Daftra + the app's own data (expenses, settings, reviews).
-- Nothing here is ever written back to Daftra.

-- ── Daftra mirror ──
CREATE TABLE IF NOT EXISTS daftra_invoices (
  id bigint PRIMARY KEY, no text NOT NULL DEFAULT '', invoice_date date NOT NULL, due_days integer NOT NULL DEFAULT 0,
  client_id bigint, client_name text NOT NULL DEFAULT '', client_city text NOT NULL DEFAULT '', branch text NOT NULL DEFAULT '',
  payment_status smallint NOT NULL DEFAULT 0, currency text NOT NULL DEFAULT 'SAR',
  net numeric(14,2) NOT NULL DEFAULT 0, tax numeric(14,2) NOT NULL DEFAULT 0, total numeric(14,2) NOT NULL DEFAULT 0,
  paid numeric(14,2) NOT NULL DEFAULT 0, unpaid numeric(14,2) NOT NULL DEFAULT 0, refund numeric(14,2) NOT NULL DEFAULT 0,
  modified text NOT NULL DEFAULT '', synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS daftra_invoices_date_idx ON daftra_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS daftra_invoices_client_idx ON daftra_invoices(client_name);
CREATE TABLE IF NOT EXISTS daftra_invoice_items (
  invoice_id bigint NOT NULL REFERENCES daftra_invoices(id) ON DELETE CASCADE, line integer NOT NULL,
  product_id bigint, item text NOT NULL DEFAULT '', quantity numeric(14,3) NOT NULL DEFAULT 0, unit_price numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0, net numeric(14,2) NOT NULL DEFAULT 0, tax numeric(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (invoice_id, line)
);
CREATE TABLE IF NOT EXISTS daftra_purchases (
  id bigint PRIMARY KEY, no text NOT NULL DEFAULT '', invoice_date date NOT NULL, due_days integer NOT NULL DEFAULT 0,
  supplier_id bigint, supplier_name text NOT NULL DEFAULT '', payment_status smallint NOT NULL DEFAULT 0,
  net numeric(14,2) NOT NULL DEFAULT 0, tax numeric(14,2) NOT NULL DEFAULT 0, total numeric(14,2) NOT NULL DEFAULT 0,
  paid numeric(14,2) NOT NULL DEFAULT 0, unpaid numeric(14,2) NOT NULL DEFAULT 0, refund numeric(14,2) NOT NULL DEFAULT 0,
  modified text NOT NULL DEFAULT '', synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS daftra_purchases_date_idx ON daftra_purchases(invoice_date);
CREATE TABLE IF NOT EXISTS daftra_purchase_items (
  purchase_id bigint NOT NULL REFERENCES daftra_purchases(id) ON DELETE CASCADE, line integer NOT NULL,
  product_id bigint, item text NOT NULL DEFAULT '', quantity numeric(14,3) NOT NULL DEFAULT 0, unit_price numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0, net numeric(14,2) NOT NULL DEFAULT 0, tax numeric(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (purchase_id, line)
);
CREATE TABLE IF NOT EXISTS daftra_products (
  id bigint PRIMARY KEY, name text NOT NULL, code text NOT NULL DEFAULT '', list_price numeric(14,2) NOT NULL DEFAULT 0,
  buy_price numeric(14,2) NOT NULL DEFAULT 0, average_cost numeric(14,4) NOT NULL DEFAULT 0, min_price numeric(14,2),
  stock numeric(14,3) NOT NULL DEFAULT 0, track_stock boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daftra_client_payments (
  id bigint PRIMARY KEY, pay_date date NOT NULL, amount numeric(14,2) NOT NULL DEFAULT 0, client_id bigint,
  invoice_id bigint, method text NOT NULL DEFAULT '', status text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS daftra_client_payments_date_idx ON daftra_client_payments(pay_date);
CREATE TABLE IF NOT EXISTS daftra_accounts (id bigint PRIMARY KEY, code text NOT NULL DEFAULT '', name text NOT NULL DEFAULT '', cat_id bigint);
CREATE TABLE IF NOT EXISTS daftra_cash_entries (
  id bigint NOT NULL, kind text NOT NULL CHECK (kind IN ('expense','income')), entry_date date NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0, tax numeric(14,2) NOT NULL DEFAULT 0, account_id bigint,
  vendor text NOT NULL DEFAULT '', note text NOT NULL DEFAULT '', modified text NOT NULL DEFAULT '',
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS daftra_cash_entries_date_idx ON daftra_cash_entries(entry_date);
CREATE TABLE IF NOT EXISTS daftra_sync (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1), started_at timestamptz, finished_at timestamptz, ok boolean,
  message text NOT NULL DEFAULT '', invoices integer NOT NULL DEFAULT 0
);
INSERT INTO daftra_sync(id) VALUES (1) ON CONFLICT DO NOTHING;

-- ── the app's own data ──
-- books_start NULL = count every invoice
CREATE TABLE IF NOT EXISTS fin_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  target_gross_margin numeric(5,2) NOT NULL DEFAULT 45, target_net_margin numeric(5,2) NOT NULL DEFAULT 15,
  books_start date, cash_balance numeric(14,2), cash_as_of date, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO fin_settings(id) VALUES (1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS fin_account_overrides (
  account_id bigint PRIMARY KEY, treatment text NOT NULL CHECK (treatment IN ('opex','cogs','exclude')),
  updated_by text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fin_audit_reviews (
  key text PRIMARY KEY, status text NOT NULL CHECK (status IN ('ok','fixed','ignored')), note text NOT NULL DEFAULT '',
  reviewed_by text, reviewed_at timestamptz NOT NULL DEFAULT now()
);
-- expenses kept in the app (not in Daftra): fixed monthly, temporary for a period, or one payment
CREATE TABLE IF NOT EXISTS app_expenses (
  id bigserial PRIMARY KEY, name text NOT NULL, cat text NOT NULL DEFAULT 'أخرى', amount numeric(14,2) NOT NULL CHECK (amount > 0),
  type text NOT NULL CHECK (type IN ('fixed','temp','once')),
  start text CHECK (start ~ '^\d{4}-\d{2}$'), "end" text CHECK ("end" ~ '^\d{4}-\d{2}$'), stop text CHECK (stop ~ '^\d{4}-\d{2}$'), date date,
  note text NOT NULL DEFAULT '', legacy_id integer UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((type = 'once' AND date IS NOT NULL) OR (type <> 'once' AND start IS NOT NULL)),
  CHECK (type <> 'temp' OR ("end" IS NOT NULL AND "end" >= start))
);
-- key/value settings: Daftra connection (key encrypted), login password hash
CREATE TABLE IF NOT EXISTS app_settings (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ai_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1), provider text NOT NULL, base_url text NOT NULL DEFAULT '', model text NOT NULL,
  api_key_enc text NOT NULL, key_hint text NOT NULL DEFAULT '', updated_by text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS login_attempts (key text PRIMARY KEY, attempts integer NOT NULL DEFAULT 0, window_started_at timestamptz NOT NULL DEFAULT now(), blocked_until timestamptz);
CREATE TABLE IF NOT EXISTS audit_logs (id bigserial PRIMARY KEY, actor_id text, action text NOT NULL, entity text NOT NULL DEFAULT '', entity_id text, details jsonb, created_at timestamptz NOT NULL DEFAULT now());
