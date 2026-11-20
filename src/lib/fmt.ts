/** Small shared helpers used across the CRM — one definition each, safe in the browser and on the server. */
export { riyadhToday } from "@/lib/riyadh-day";

/** Any canonical UUID text (8-4-4-4-12 hex), as accepted by PostgreSQL's uuid type. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** YYYY-MM-DD plus n days (calendar days, no time-zone drift). */
export const addDays = (d: string, n: number) => { const t = new Date(`${d.slice(0, 10)}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

/** Whole riyals: 12,400 ر.س (— when empty). */
export const sar = (n: number | null | undefined) => n === null || n === undefined || !Number.isFinite(n) ? "—" : `${Math.round(n).toLocaleString("en-US")} ر.س`;

/* ── Rounding ── */
export const r0 = (n: number) => Math.round(n);
export const r2 = (n: number) => Math.round(n * 100) / 100;
export const r3 = (n: number) => Math.round(n * 1000) / 1000;

/* ── Date arithmetic (YYYY-MM) ── */
export function prevMonth(m: string) { let [y, mo] = m.split("-").map(Number); mo--; if (mo < 1) { mo = 12; y--; } return `${y}-${String(mo).padStart(2, "0")}`; }
export function nextMonth(m: string) { let [y, mo] = m.split("-").map(Number); mo++; if (mo > 12) { mo = 1; y++; } return `${y}-${String(mo).padStart(2, "0")}`; }
export function shiftMonth(m: string, n: number) { let [y, mo] = m.split("-").map(Number); mo += n; while (mo < 1) { mo += 12; y--; } while (mo > 12) { mo -= 12; y++; } return `${y}-${String(mo).padStart(2, "0")}`; }
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
