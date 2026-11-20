-- Reps: each linked to a product. All company sales of that product count as the rep's sales.
CREATE TABLE IF NOT EXISTS reps (
  id serial PRIMARY KEY,
  name text NOT NULL,
  product_id bigint REFERENCES daftra_products(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  sample_pct numeric(5,2),   -- NULL = use global default
  promo_pct numeric(5,2),    -- NULL = use global default
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Global default percentages
ALTER TABLE fin_settings
  ADD COLUMN IF NOT EXISTS sample_pct numeric(5,2) NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS promo_pct numeric(5,2) NOT NULL DEFAULT 5;

-- Monthly budget snapshot: frozen on first access each month so retroactive invoice edits don't shift mid-month budgets.
-- sample_budget and promo_budget are in UNITS (quantity), not money.
CREATE TABLE IF NOT EXISTS rep_budgets (
  id serial PRIMARY KEY,
  rep_id integer NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  month text NOT NULL,              -- YYYY-MM
  prev_units numeric(14,3) NOT NULL DEFAULT 0,  -- units sold last month (for the rep's product)
  sample_budget numeric(14,3) NOT NULL DEFAULT 0,  -- prev_units × sample_pct / 100
  promo_budget numeric(14,2) NOT NULL DEFAULT 0,   -- prev_units × unit_cost × promo_pct / 100 (money for promo)
  sample_pct numeric(5,2) NOT NULL,
  promo_pct numeric(5,2) NOT NULL,
  unit_cost numeric(14,4) NOT NULL DEFAULT 0,  -- average_cost at freeze time, for promo budget calc
  prev_sales numeric(14,2) NOT NULL DEFAULT 0, -- monetary sales value for reference
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rep_id, month)
);

-- Sample dispensing: rep takes N units at once
CREATE TABLE IF NOT EXISTS sample_records (
  id serial PRIMARY KEY,
  rep_id integer NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  month text NOT NULL,
  dispensed_at timestamptz NOT NULL DEFAULT now(),
  total_units numeric(14,3) NOT NULL DEFAULT 0,
  total_cost numeric(14,2) NOT NULL DEFAULT 0,  -- total_units × unit_cost, for cash/expense integration
  over_budget boolean NOT NULL DEFAULT false,
  override_reason text,
  notes text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sample_records_rep_month ON sample_records(rep_id, month);

-- Promo expenses: PMS, lunch invite, RTD, other
CREATE TABLE IF NOT EXISTS promo_expenses (
  id serial PRIMARY KEY,
  rep_id integer NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  month text NOT NULL,
  expense_date date NOT NULL,
  promo_type text NOT NULL CHECK (promo_type IN ('pms','lunch','rtd','other')),
  other_desc text NOT NULL DEFAULT '',
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  place text NOT NULL DEFAULT '',
  doctors text NOT NULL DEFAULT '[]',  -- JSON array of doctor names
  attendees smallint NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  over_budget boolean NOT NULL DEFAULT false,
  override_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS promo_expenses_rep_month ON promo_expenses(rep_id, month);
