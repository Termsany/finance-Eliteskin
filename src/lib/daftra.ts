import { pool, query } from "@/lib/db";
import { daftraCfg, setSetting, type DaftraCfg } from "@/lib/settings";
import { r2 } from "@/lib/fmt";

/**
 * Daftra API client — strictly READ-ONLY (GET requests only). Nothing in the CRM ever writes to Daftra.
 * Credentials come from the settings page (stored encrypted) or the server environment, never from the browser.
 */
let CFG: DaftraCfg | null = null;
export async function daftraConfigured() { CFG = await daftraCfg(); return !!CFG; }
/** DAFTRA_BASE_URL points at a mock API in local tests only. */
const base = (c: DaftraCfg) => process.env.DAFTRA_BASE_URL || `https://${c.sub}.${c.domain}/api2`;
export const PAYMENT_LABEL: Record<number, string> = { 0: "غير مدفوعة", 1: "مدفوعة جزئياً", 2: "مدفوعة", 3: "مرتجعة" };

type Json = Record<string, unknown>;
async function get(path: string, cfg?: DaftraCfg): Promise<Json> {
  const c = cfg || CFG || await daftraCfg();
  if (!c) throw new Error("Daftra is not configured");
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`${base(c)}/${path}`, { method: "GET", headers: { APIKEY: c.key, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(30000) });
    if (r.status === 429 || r.status >= 500) { await new Promise(res => setTimeout(res, 1500 * (attempt + 1))); continue; }
    const j = await r.json().catch(() => null) as Json | null;
    if (!r.ok || !j || j.result !== "successful") throw new Error(`Daftra ${path.split("?")[0]}: HTTP ${r.status} ${String(j?.message || "")}`.trim());
    return j;
  }
  throw new Error(`Daftra ${path.split("?")[0]}: retries exhausted`);
}
/** Reads every page of a list endpoint and returns the inner objects under `key`. */
/** Wrapper keys Daftra actually used per endpoint in the last sync (for the reconciliation screen). */
export const seenKeys: Record<string, string[]> = {};
async function listAll(endpoint: string, key: string): Promise<Json[]> {
  const out: Json[] = []; const keys = new Set<string>();
  for (let page = 1; page < 500; page++) {
    const j = await get(`${endpoint}.json?limit=100&page=${page}`);
    for (const x of (j.data as Json[]) || []) {
      if (x[key]) { keys.add(key); out.push(x[key] as Json); }
      else {
        const k = Object.keys(x).find(n => x[n] && typeof x[n] === "object" && !Array.isArray(x[n]));
        if (k) { keys.add(k); out.push(x[k] as Json); }
        else console.warn(`daftra listAll(${endpoint}): row has no object under "${key}" — keys: ${Object.keys(x).join(", ")}`);
      }
    }
    const pg = j.pagination as Json | undefined;
    if (!pg || !pg.next) break;
  }
  seenKeys[endpoint] = [...keys];
  return out;
}
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
/** Count and sum items per label. */
function tally<T>(xs: T[], label: (x: T) => string, amount: (x: T) => number) {
  const out: Record<string, { n: number; sum: number }> = {};
  for (const x of xs) { const k = label(x); const o = out[k] || (out[k] = { n: 0, sum: 0 }); o.n++; o.sum = Math.round((o.sum + amount(x)) * 100) / 100; }
  return out;
}
const docTypes: Record<string, Record<string, { n: number; sum: number }>> = {};
/** Daftra returns ISO dates in lists but the account date format (dd/mm/yyyy) in details. */
export function isoDate(v: unknown) { const s = String(v || "").trim(); const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`; const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/); return dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : ""; }

/** Pure mapping of a sales invoice OR purchase invoice detail payload to our row + lines. Exported for tests. */
export function mapInvoice(inv: Json, kind: "sale" | "purchase" = "sale") {
  const P = kind === "sale" ? { items: "InvoiceItem", tax: "InvoiceTax", cf: "InvoiceCustomField", party: "client" } : { items: "PurchaseOrderItem", tax: "PurchaseOrderTax", cf: "PurchaseOrderCustomField", party: "supplier" };
  const items = (Array.isArray(inv[P.items]) ? inv[P.items] : []) as Json[];
  const taxes = Object.values((inv[P.tax] && typeof inv[P.tax] === "object" ? inv[P.tax] : {}) as Record<string, Json>);
  const cf = (Array.isArray(inv[P.cf]) ? inv[P.cf] : []) as Json[];
  const total = num(inv.summary_total);
  const tax = r2(taxes.reduce((s, t) => s + num(t.invoice_value), 0));
  const party = (inv[`${P.party}_business_name`] as string) || [inv[`${P.party}_first_name`], inv[`${P.party}_last_name`]].filter(Boolean).join(" ");
  return {
    row: {
      id: num(inv.id), no: String(inv.no || ""), invoice_date: isoDate(inv.date || inv.issue_date), due_days: num(inv.due_after),
      party_id: inv[`${P.party}_id`] ? num(inv[`${P.party}_id`]) : null, party_name: String(party || "").trim(), city: String(inv[`${P.party}_city`] || "").trim(),
      branch: String(cf.find(f => String(f.label).toLowerCase() === "branch")?.value || "").trim().toLowerCase(),
      payment_status: num(inv.payment_status), currency: String(inv.currency_code || "SAR"),
      net: r2(total - tax), tax, total: r2(total), paid: r2(num(inv.summary_paid)), unpaid: r2(num(inv.summary_unpaid)), refund: r2(num(inv.summary_refund)),
      modified: String(inv.modified || ""),
    },
    lines: items.map((it, i) => {
      const lineTax = r2(num(it.summary_tax1) + num(it.summary_tax2));
      return { line: i + 1, product_id: it.product_id ? num(it.product_id) : null, item: String(it.item || "").trim(), quantity: num(it.quantity), unit_price: num(it.unit_price),
        discount: r2(num(it.calculated_discount)), net: r2(num(it.subtotal) - lineTax), tax: lineTax };
    }),
  };
}

/**
 * Payments recorded inside a sales invoice's detail (Daftra puts them under InvoicePayment). Exported for tests.
 * Any array under a key containing "Payment" whose rows carry an amount is taken, so a renamed key still works.
 */
export function mapInvoicePayments(data: Json, invoiceId: number, clientId: number | null) {
  const out: Array<{ id: number; invoice_id: number; client_id: number | null; pay_date: string | null; amount: number; method: string; status: string; raw: string }> = [];
  for (const [k, v] of Object.entries(data || {})) {
    if (!/payment/i.test(k)) continue;
    const rows = (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v as Json) : []) as Json[];
    for (const p of rows) {
      if (!p || typeof p !== "object" || !num(p.id) || p.amount === undefined) continue;
      out.push({ id: num(p.id), invoice_id: invoiceId, client_id: clientId, pay_date: isoDate(p.date) || null, amount: r2(num(p.amount)),
        method: String(p.payment_method || ""), status: String(p.status ?? ""), raw: JSON.stringify(p) });
    }
  }
  return out;
}

/** Expense/income entry → net-of-VAT amount + VAT. */
export function mapCash(e: Json, kind: "expense" | "income") {
  const amount = num(e.amount), tax = r2(num(e.tax1_amount) + num(e.tax2_amount));
  const included = String(e.tax1_included) === "1" || String(e.tax2_included) === "1";
  return { id: num(e.id), kind, entry_date: isoDate(e.date), amount: r2(included ? amount - tax : amount), tax, account_id: e.journal_account_id ? num(e.journal_account_id) : null,
    vendor: String(e.vendor || "").trim(), note: String(e.note || "").trim(), modified: String(e.modified || "") };
}

let running: Promise<SyncResult> | null = null;
type SyncResult = { invoices: number; updated: number; purchases: number; products: number; payments: number; entries: number };
/** Incremental sync of everything the finance hub needs. */
export function syncDaftra() {
  if (!running) running = doSync().finally(() => { running = null; });
  return running;
}

async function syncDocs(kind: "sale" | "purchase") {
  const T = kind === "sale" ? { list: "invoices", key: "Invoice", table: "daftra_invoices", items: "daftra_invoice_items", fk: "invoice_id" }
    : { list: "purchase_invoices", key: "PurchaseOrder", table: "daftra_purchases", items: "daftra_purchase_items", fk: "purchase_id" };
  const all = await listAll(T.list, T.key);
  const isPlain = (x: Json) => String(x.type) === "0" && String(x.draft) !== "1";
  // credit notes / returns and drafts aren't invoices, but they move the customer's balance in Daftra — keep them for reconciliation
  const pf = kind === "sale" ? "client" : "supplier";
  await replaceAll("daftra_other_docs", ["id", "kind", "type", "no", "doc_date", "party_id", "party_name", "total", "draft", "raw"],
    all.filter(x => !isPlain(x)).map(x => [num(x.id), kind, String(x.type ?? ""), String(x.no || ""), isoDate(x.date) || null,
      x[`${pf}_id`] ? num(x[`${pf}_id`]) : null, String(x[`${pf}_business_name`] || [x[`${pf}_first_name`], x[`${pf}_last_name`]].filter(Boolean).join(" ") || "").trim(),
      num(x.summary_total), String(x.draft) === "1", JSON.stringify(x)]), `WHERE kind='${kind}'`);
  docTypes[kind] = tally(all, x => `${String(x.type ?? "?")}${String(x.draft) === "1" ? " (draft)" : ""}`, x => num(x.summary_total));
  const listed = all.filter(isPlain)
    .map(x => ({ id: num(x.id), modified: String(x.modified || ""), date: isoDate(x.date) }));
  const known = new Map((await query<{ id: string; modified: string }>(`SELECT id, modified FROM ${T.table}`)).rows.map(r => [Number(r.id), r.modified] as [number, string]));
  // Also re-read open invoices (payment_status 0 or 1) — their payments may have changed without bumping `modified`
  const openIds = new Set((await query<{ id: string }>(`SELECT id FROM ${T.table} WHERE payment_status IN (0, 1)`)).rows.map(r => Number(r.id)));
  let updated = 0;
  for (const x of listed.filter(l => known.get(l.id) !== l.modified || openIds.has(l.id))) {
    const j = await get(`${T.list}/${x.id}.json`);
    const { row, lines } = mapInvoice(((j.data as Json)[T.key]) as Json, kind);
    if (x.date) row.invoice_date = x.date; row.modified = x.modified;   // list payload is authoritative (stable formats)
    if (!row.invoice_date) continue;
    if (row.currency && row.currency !== "SAR") console.warn(`daftra sync ${kind}: invoice ${row.id} is in ${row.currency}, not SAR — amounts may be wrong`);
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      if (kind === "sale") await c.query(`INSERT INTO daftra_invoices(id,no,invoice_date,due_days,client_id,client_name,client_city,branch,payment_status,currency,net,tax,total,paid,unpaid,refund,modified,synced_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now())
        ON CONFLICT(id) DO UPDATE SET no=$2,invoice_date=$3,due_days=$4,client_id=$5,client_name=$6,client_city=$7,branch=$8,payment_status=$9,currency=$10,net=$11,tax=$12,total=$13,paid=$14,unpaid=$15,refund=$16,modified=$17,synced_at=now()`,
        [row.id, row.no, row.invoice_date, row.due_days, row.party_id, row.party_name, row.city, row.branch, row.payment_status, row.currency, row.net, row.tax, row.total, row.paid, row.unpaid, row.refund, row.modified]);
      else await c.query(`INSERT INTO daftra_purchases(id,no,invoice_date,due_days,supplier_id,supplier_name,payment_status,net,tax,total,paid,unpaid,refund,modified,synced_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
        ON CONFLICT(id) DO UPDATE SET no=$2,invoice_date=$3,due_days=$4,supplier_id=$5,supplier_name=$6,payment_status=$7,net=$8,tax=$9,total=$10,paid=$11,unpaid=$12,refund=$13,modified=$14,synced_at=now()`,
        [row.id, row.no, row.invoice_date, row.due_days, row.party_id, row.party_name, row.payment_status, row.net, row.tax, row.total, row.paid, row.unpaid, row.refund, row.modified]);
      if (kind === "sale") {
        await c.query("DELETE FROM daftra_invoice_payments WHERE invoice_id=$1", [row.id]);
        for (const p of mapInvoicePayments(j.data as Json, row.id, row.party_id))
          await c.query(`INSERT INTO daftra_invoice_payments(id,invoice_id,client_id,pay_date,amount,method,status,raw) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT(id) DO UPDATE SET invoice_id=$2,client_id=$3,pay_date=$4,amount=$5,method=$6,status=$7,raw=$8`, [p.id, p.invoice_id, p.client_id, p.pay_date, p.amount, p.method, p.status, p.raw]);
      }
      await c.query(`DELETE FROM ${T.items} WHERE ${T.fk}=$1`, [row.id]);
      for (const l of lines) await c.query(`INSERT INTO ${T.items}(${T.fk},line,product_id,item,quantity,unit_price,discount,net,tax) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [row.id, l.line, l.product_id, l.item, l.quantity, l.unit_price, l.discount, l.net, l.tax]);
      await c.query("COMMIT"); updated++;
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
  }
  // Guard: don't mass-delete when Daftra returned an empty or suspiciously short list
  const existing = (await query<{ n: string }>(`SELECT count(*)::text n FROM ${T.table}`)).rows[0];
  const existingCount = Number(existing?.n || 0);
  if (listed.length === 0 && existingCount > 0) {
    console.warn(`daftra sync ${kind}: API returned 0 documents but we have ${existingCount} — skipping delete`);
  } else if (existingCount > 10 && listed.length < existingCount * 0.5) {
    console.warn(`daftra sync ${kind}: API returned ${listed.length} but we have ${existingCount} (< 50%) — skipping delete`);
  } else {
    await query(`DELETE FROM ${T.table} WHERE NOT (id = ANY($1::bigint[]))`, [listed.map(x => x.id)]);
  }
  return { count: listed.length, updated };
}

async function replaceAll(table: string, cols: string[], rows: unknown[][], where = "") {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`daftra:${table}`]);
    // Guard: don't wipe the table when Daftra returned nothing
    const existing = (await c.query(`SELECT count(*)::text n FROM ${table} ${where}`)).rows[0];
    const existingCount = Number(existing?.n || 0);
    if (rows.length === 0 && existingCount > 0) {
      console.warn(`daftra replaceAll(${table}): API returned 0 rows but we have ${existingCount} — skipping`);
      await c.query("ROLLBACK"); return;
    }
    if (existingCount > 10 && rows.length < existingCount * 0.5) {
      console.warn(`daftra replaceAll(${table}): API returned ${rows.length} but we have ${existingCount} (< 50%) — skipping`);
      await c.query("ROLLBACK"); return;
    }
    await c.query(`DELETE FROM ${table} ${where}`);
    const ph = cols.map((_, i) => `$${i + 1}`).join(",");
    const unique = [...new Map(rows.map(r => [String(r[0]), r])).values()];
    for (const r of unique) await c.query(`INSERT INTO ${table}(${cols.join(",")}) VALUES(${ph}) ON CONFLICT DO NOTHING`, r);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
}

async function doSync(): Promise<SyncResult> {
  if (!(await daftraConfigured())) throw new Error("Daftra is not configured");
  await query("UPDATE daftra_sync SET started_at=now(), message='جارٍ المزامنة…' WHERE id=1");
  try {
    const sales = await syncDocs("sale");
    const purchases = await syncDocs("purchase");
    const products = await listAll("products", "Product");
    await replaceAll("daftra_products", ["id", "name", "code", "list_price", "buy_price", "average_cost", "min_price", "stock", "track_stock", "active"],
      products.map(p => [num(p.id), String(p.name || "").trim(), String(p.product_code || ""), num(p.unit_price), num(p.buy_price), num(p.average_price), p.minimum_price ? num(p.minimum_price) : null, num(p.stock_balance), String(p.track_stock) === "1", String(p.deactivate) !== "1"]));
    const payments = await listAll("client_payments", "ClientPayment");
    await replaceAll("daftra_client_payments", ["id", "pay_date", "amount", "client_id", "invoice_id", "method", "status", "raw"],
      payments.filter(p => isoDate(p.date)).map(p => [num(p.id), isoDate(p.date), num(p.amount), p.client_id && num(p.client_id) ? num(p.client_id) : null, p.invoice_id && num(p.invoice_id) ? num(p.invoice_id) : null, String(p.payment_method || ""), String(p.status ?? ""), JSON.stringify(p)]));
    await setSetting("sync_diag", JSON.stringify({ at: new Date().toISOString(), keys: seenKeys, doc_types: docTypes,
      payments: { total: payments.length, by_status: tally(payments, p => String(p.status ?? "?"), p => num(p.amount)),
        linked: tally(payments.filter(p => num(p.invoice_id)), () => "linked", p => num(p.amount)).linked || { n: 0, sum: 0 },
        unlinked: tally(payments.filter(p => !num(p.invoice_id)), () => "unlinked", p => num(p.amount)).unlinked || { n: 0, sum: 0 },
        no_client: payments.filter(p => !num(p.client_id)).length } }));
    const accounts = await listAll("journal_accounts", "JournalAccount");
    await replaceAll("daftra_accounts", ["id", "code", "name", "cat_id"], accounts.map(a => [num(a.id), String(a.code || ""), String(a.name || "").trim(), a.journal_cat_id ? num(a.journal_cat_id) : null]));
    const exp = (await listAll("expenses", "Expense")).map(e => mapCash(e, "expense")), inc = (await listAll("incomes", "Income")).map(e => mapCash(e, "income"));
    const entries = [...exp, ...inc].filter(e => e.entry_date);
    await replaceAll("daftra_cash_entries", ["id", "kind", "entry_date", "amount", "tax", "account_id", "vendor", "note", "modified"],
      entries.map(e => [e.id, e.kind, e.entry_date, e.amount, e.tax, e.account_id, e.vendor, e.note, e.modified]));
    const result = { invoices: sales.count, updated: sales.updated + purchases.updated, purchases: purchases.count, products: products.length, payments: payments.length, entries: entries.length };
    await query("UPDATE daftra_sync SET finished_at=now(), ok=true, message=$1, invoices=$2 WHERE id=1",
      [`تمت المزامنة — ${sales.count} فاتورة بيع، ${purchases.count} فاتورة شراء، ${entries.length} مصروف/إيراد`, sales.count]);
    return result;
  } catch (e) {
    await query("UPDATE daftra_sync SET finished_at=now(), ok=false, message=$1 WHERE id=1", [String((e as Error).message).slice(0, 300)]).catch(() => {});
    throw e;
  }
}

/** Starts a background sync when the mirror is older than `maxAgeMin` (never blocks the page). */
export async function syncIfStale(maxAgeMin = 60) {
  if (running || !(await daftraConfigured())) return;
  const s = (await query("SELECT finished_at FROM daftra_sync WHERE id=1")).rows[0] as { finished_at: string | null } | undefined;
  const last = s?.finished_at ? new Date(s.finished_at).getTime() : 0;
  if (Date.now() - last > maxAgeMin * 60000) void syncDaftra().catch(e => console.error("daftra sync", e));
}
export const syncRunning = () => !!running;

/** Checks a connection before it is saved: one page of clients. */
export async function testDaftra(cfg: DaftraCfg) {
  const j = await get("clients.json?limit=5&page=1", cfg);
  const pg = j.pagination as Record<string, unknown> | undefined;
  return { clients: Number(pg?.total_results ?? pg?.count ?? (Array.isArray(j.data) ? j.data.length : 0)) || 0 };
}

/**
 * What Daftra returns for given client ids, raw: the client record, every invoice-list row (all types), every payment
 * row for them, and a probe of the invoice_payments endpoint. Read-only. For reconciling a customer by hand.
 */
export async function debugClient(ids: number[]) {
  const want = new Set(ids.map(String));
  const tryGet = async (path: string) => { try { return await get(path); } catch (e) { return { error: String((e as Error).message) }; } };
  const pageAll = async (endpoint: string, field: string) => {
    const rows: Json[] = []; let pages = 0;
    for (let page = 1; page < 300; page++) {
      const j = await get(`${endpoint}.json?limit=100&page=${page}`); pages++;
      for (const x of (j.data as Json[]) || []) { const inner = Object.values(x).find(v => v && typeof v === "object" && !Array.isArray(v)) as Json | undefined;
        if (inner && want.has(String(inner[field] ?? ""))) rows.push(x); }
      const pg = j.pagination as Json | undefined; if (!pg || !pg.next) break;
    }
    return { pages, rows };
  };
  return {
    at: new Date().toISOString(),
    clients: await Promise.all(ids.map(id => tryGet(`clients/${id}.json`))),
    invoices: await pageAll("invoices", "client_id").catch(e => ({ error: String((e as Error).message) })),
    client_payments: await pageAll("client_payments", "client_id").catch(e => ({ error: String((e as Error).message) })),
    invoice_payments_probe: await tryGet("invoice_payments.json?limit=5&page=1"),
    invoice_details: await (async () => { const r = await query<{ id: string }>("SELECT id FROM daftra_invoices WHERE client_id = ANY($1::bigint[]) ORDER BY invoice_date DESC LIMIT 25", [ids]);
      const out: Json[] = []; for (const x of r.rows) out.push(await tryGet(`invoices/${x.id}.json`)); return out; })(),
  };
}

