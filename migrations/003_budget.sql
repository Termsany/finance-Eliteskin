-- Monthly targets the owner sets, for the budget card (sales to aim for, net profit to aim for).
ALTER TABLE fin_settings
  ADD COLUMN IF NOT EXISTS monthly_sales_target  numeric(14,2),
  ADD COLUMN IF NOT EXISTS monthly_profit_target numeric(14,2);
