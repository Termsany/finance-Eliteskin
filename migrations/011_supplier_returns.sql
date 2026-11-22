-- Purchase returns (credit notes on purchases) reduce what we owe the supplier.
-- Mirrors daftra_standalone_returns for suppliers: excess credit-note value beyond what's already in purchase refunds.
CREATE OR REPLACE VIEW daftra_supplier_standalone_returns AS
  SELECT r.party_id AS supplier_id, max(r.doc_date) AS pay_date, round(sum(abs(r.total)) - coalesce(p.refunds, 0), 2) AS amount
  FROM daftra_other_docs r
  LEFT JOIN (SELECT supplier_id, sum(refund) refunds FROM daftra_purchases GROUP BY supplier_id) p ON p.supplier_id = r.party_id
  WHERE r.kind = 'purchase' AND NOT r.draft AND r.type IN ('5', '6') AND r.party_id IS NOT NULL AND r.doc_date IS NOT NULL
  GROUP BY r.party_id, p.refunds
  HAVING sum(abs(r.total)) - coalesce(p.refunds, 0) >= 1;
