/** The app's pages, in menu order. The accounts sections are tabs of the home page (/?tab=…). */
export type NavItem = { href: string; label: string; icon: string; tab?: string; group: "primary" | "more"; mobile?: boolean };

export const NAV: NavItem[] = [
  { href: "/", tab: "summary", label: "الملخص", icon: "dashboard", group: "primary", mobile: true },
  { href: "/?tab=collections", tab: "collections", label: "التحصيل", icon: "time", group: "primary", mobile: true },
  { href: "/?tab=clients", tab: "clients", label: "العملاء", icon: "doctors", group: "primary", mobile: true },
  { href: "/?tab=suppliers", tab: "suppliers", label: "الموردين", icon: "send", group: "primary" },
  { href: "/?tab=offsets", tab: "offsets", label: "مقاصة الموردين", icon: "repeat", group: "primary" },
  { href: "/?tab=expenses", tab: "expenses", label: "المصروفات", icon: "wallet", group: "primary", mobile: true },
  { href: "/?tab=pnl", tab: "pnl", label: "الأرباح والخسائر", icon: "reports", group: "primary" },
  { href: "/?tab=cash", tab: "cash", label: "السيولة", icon: "calendar", group: "primary" },
  { href: "/?tab=samples", tab: "samples", label: "العينات والدعاية", icon: "samples", group: "primary" },
  { href: "/?tab=vat", tab: "vat", label: "الضريبة", icon: "file", group: "more" },
  { href: "/?tab=products", tab: "products", label: "المنتجات والأسعار", icon: "products", group: "more" },
  { href: "/?tab=audit", tab: "audit", label: "مراجعة الحسابات", icon: "check", group: "more" },
  { href: "/settings", label: "الإعدادات", icon: "pen", group: "more" },
];

/** The menu entry that is active for a path + ?tab= (old tab names map to their new place). */
const ALIAS: Record<string, string> = { ar: "clients", ap: "suppliers", pricing: "products", advisor: "summary", sales: "clients" };
export function activeHref(path: string, tab: string | null) {
  if (path.startsWith("/settings")) return "/settings";
  const t = ALIAS[tab || ""] || tab || "summary";
  return NAV.find(n => n.tab === t)?.href || "/";
}
export const tabLabel = (tab: string) => NAV.find(n => n.tab === (ALIAS[tab] || tab))?.label || "الملخص";
