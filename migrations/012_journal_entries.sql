-- Journal entries from Daftra: used to compute bank and treasury balances automatically.
-- Each row is one line of a journal entry (debit or credit side).
CREATE TABLE IF NOT EXISTS daftra_journal_entries (
  id bigint NOT NULL,
  entry_id bigint NOT NULL,
  entry_date date NOT NULL,
  account_id bigint NOT NULL,
  debit numeric(14,2) NOT NULL DEFAULT 0,
  credit numeric(14,2) NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  PRIMARY KEY (id, entry_id)
);
CREATE INDEX IF NOT EXISTS idx_journal_entries_account ON daftra_journal_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON daftra_journal_entries(entry_date);

-- Also extend daftra_accounts to store balance info if Daftra provides it
ALTER TABLE daftra_accounts ADD COLUMN IF NOT EXISTS balance numeric(14,2);
ALTER TABLE daftra_accounts ADD COLUMN IF NOT EXISTS debit_total numeric(14,2);
ALTER TABLE daftra_accounts ADD COLUMN IF NOT EXISTS credit_total numeric(14,2);
