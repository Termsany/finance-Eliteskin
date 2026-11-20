-- Everything Daftra sends that the books leave out, so a customer's numbers can be reconciled with Daftra:
-- documents other than plain invoices (credit notes / returns, drafts …) and the raw payment records.
CREATE TABLE IF NOT EXISTS daftra_other_docs (
  kind text NOT NULL,                -- 'sale' | 'purchase'
  id bigint NOT NULL,
  type text NOT NULL DEFAULT '',
  no text NOT NULL DEFAULT '',
  doc_date date,
  party_id bigint,
  party_name text NOT NULL DEFAULT '',
  total numeric(14,2) NOT NULL DEFAULT 0,
  draft boolean NOT NULL DEFAULT false,
  raw jsonb,
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS daftra_other_docs_party_idx ON daftra_other_docs(party_id);
-- keep the raw payment as Daftra sent it (status and all), so nothing is filtered out silently
ALTER TABLE daftra_client_payments ADD COLUMN IF NOT EXISTS raw jsonb;
