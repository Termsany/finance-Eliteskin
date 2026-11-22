-- Payments recorded inside a purchase invoice (the supplier's side of InvoicePayment).
-- Mirrors daftra_invoice_payments for purchases so supplier statements get real payment dates.
CREATE TABLE IF NOT EXISTS daftra_purchase_payments (
  id bigint PRIMARY KEY,
  purchase_id bigint NOT NULL,
  supplier_id bigint,
  pay_date date,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '',
  raw jsonb
);
CREATE INDEX IF NOT EXISTS daftra_purchase_payments_supplier_idx ON daftra_purchase_payments(supplier_id);
-- re-read every purchase invoice's details so its payments are picked up
UPDATE daftra_purchases SET modified = '';
