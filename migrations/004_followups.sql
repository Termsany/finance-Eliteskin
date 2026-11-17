-- Collection follow-ups and payment promises per customer (the app's own CRM layer over Daftra's customers).
CREATE TABLE IF NOT EXISTS collection_followups (
  id bigserial PRIMARY KEY,
  customer text NOT NULL,
  note text NOT NULL DEFAULT '',
  promise_date date,                 -- set when the customer promised to pay on a day
  promise_amount numeric(14,2),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','kept','broken')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collection_followups_customer_idx ON collection_followups(customer);
CREATE INDEX IF NOT EXISTS collection_followups_promise_idx ON collection_followups(promise_date) WHERE status = 'open';
