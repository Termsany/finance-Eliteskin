-- Sales returns (credit notes / refund receipts) reduce what the customer owes. A return made against an invoice is
-- already in that invoice's refund amount; whatever return value a customer has beyond those refunds is a return
-- not tied to an invoice in the books, and is deducted from the customer's balance like a payment (not as cash).
CREATE OR REPLACE VIEW daftra_standalone_returns AS
  SELECT r.party_id AS client_id, max(r.doc_date) AS pay_date, round(sum(abs(r.total)) - coalesce(i.refunds, 0), 2) AS amount
  FROM daftra_other_docs r
  LEFT JOIN (SELECT client_id, sum(refund) refunds FROM daftra_invoices GROUP BY client_id) i ON i.client_id = r.party_id
  WHERE r.kind = 'sale' AND NOT r.draft AND r.type IN ('5', '6') AND r.party_id IS NOT NULL AND r.doc_date IS NOT NULL
  GROUP BY r.party_id, i.refunds
  HAVING sum(abs(r.total)) - coalesce(i.refunds, 0) >= 1;
