-- Supplier offsets («مقاصة الموردين»): some customers buy straight from a supplier (the supplier invoices them);
-- the supplier owes us (customer price − our price) × qty per item and deducts it from our account once it has
-- collected from the customer. The deduction itself is recorded in Daftra; the app only follows each order until then.

-- agreed prices per supplier + customer + item (client '' = the same price for every customer)
CREATE TABLE IF NOT EXISTS offset_prices (
  id bigserial PRIMARY KEY, supplier text NOT NULL, client text NOT NULL DEFAULT '', item text NOT NULL, product_id bigint,
  client_price numeric(14,2) NOT NULL CHECK (client_price >= 0), my_price numeric(14,2) NOT NULL CHECK (my_price >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier, client, item)
);

-- printed → collected (the supplier got paid by the customer) → settled (deducted from the supplier's account)
CREATE TABLE IF NOT EXISTS offset_orders (
  id bigserial PRIMARY KEY, supplier text NOT NULL, client text NOT NULL, order_date date NOT NULL, ref text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'printed' CHECK (status IN ('printed','collected','settled')),
  collected_at date, settled_at date, settled_amount numeric(14,2),
  -- a settlement short of the expected amount stays open until it is closed on purpose
  short_closed boolean NOT NULL DEFAULT false,
  note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS offset_orders_supplier_idx ON offset_orders(supplier);
CREATE INDEX IF NOT EXISTS offset_orders_status_idx ON offset_orders(status);

CREATE TABLE IF NOT EXISTS offset_order_items (
  order_id bigint NOT NULL REFERENCES offset_orders(id) ON DELETE CASCADE, line integer NOT NULL,
  item text NOT NULL, product_id bigint, qty numeric(14,3) NOT NULL CHECK (qty > 0),
  client_price numeric(14,2) NOT NULL CHECK (client_price >= 0), my_price numeric(14,2) NOT NULL CHECK (my_price >= 0),
  PRIMARY KEY (order_id, line)
);
