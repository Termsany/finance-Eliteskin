-- Payments Daftra records inside an invoice (paid on the invoice itself). Daftra's client_payments list only has
-- payments made on the customer's account, so these never reached the app and collections/credit came out short.
CREATE TABLE IF NOT EXISTS daftra_invoice_payments (
  id bigint PRIMARY KEY,
  invoice_id bigint NOT NULL,
  client_id bigint,
  pay_date date,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '',
  raw jsonb
);
CREATE INDEX IF NOT EXISTS daftra_invoice_payments_client_idx ON daftra_invoice_payments(client_id);
-- every customer payment that is real money: account payments + payments made on an invoice
-- (not the same payment twice, and not an application of the customer's own credit to an invoice)
CREATE OR REPLACE VIEW daftra_payments_all AS
  SELECT id, pay_date, amount, client_id, invoice_id, method, status, 'account'::text source FROM daftra_client_payments WHERE status = '1'
  UNION ALL
  SELECT p.id, coalesce(p.pay_date, i.invoice_date), p.amount, coalesce(p.client_id, i.client_id), p.invoice_id, p.method, p.status, 'invoice'
  FROM daftra_invoice_payments p JOIN daftra_invoices i ON i.id = p.invoice_id
  WHERE p.status IN ('1', '') AND p.method !~* 'credit' AND p.id NOT IN (SELECT id FROM daftra_client_payments);
-- read every sales invoice's details again on the next sync, so its payments are picked up
UPDATE daftra_invoices SET modified = '';
