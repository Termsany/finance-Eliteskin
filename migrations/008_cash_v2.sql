-- Cash forecast v2: VAT filing period, collection rate, weekly balance log
ALTER TABLE fin_settings
  ADD COLUMN IF NOT EXISTS vat_filing text NOT NULL DEFAULT 'quarterly' CHECK (vat_filing IN ('monthly','quarterly')),
  ADD COLUMN IF NOT EXISTS cash_collect_pct smallint NOT NULL DEFAULT 90 CHECK (cash_collect_pct BETWEEN 10 AND 100);

CREATE TABLE IF NOT EXISTS cash_balance_log (
  week_start date PRIMARY KEY,
  actual numeric(14,2) NOT NULL,
  forecast numeric(14,2),
  logged_at timestamptz NOT NULL DEFAULT now()
);
