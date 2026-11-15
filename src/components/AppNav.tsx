"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import SidebarNav from "@/components/SidebarNav";
import { Icon } from "@/components/Icon";
import { Logo, BrandMark, Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NAV, activeHref, tabLabel } from "@/lib/nav";

const strip = ({ href, label, icon }: { href: string; label: string; icon: string }) => ({ href, label, icon });
function useActive() {
  const path = usePathname(), sp = useSearchParams();
  return activeHref(path, sp.get("tab"));
}

/** Desktop sidebar menu (same look as «الميدان»), active item follows the URL. */
export function SideMenu() {
  const active = useActive();
  return <SidebarNav primary={NAV.filter(n => n.group === "primary").map(strip)} more={NAV.filter(n => n.group === "more").map(strip)} active={active} />;
}

/** Phone and tablet: top bar, bottom tab bar and a drawer with every section. */
export function MobileMenu() {
  const active = useActive(), sp = useSearchParams(), path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [active]);
  const title = path.startsWith("/settings") ? "الإعدادات" : tabLabel(sp.get("tab") || "summary");
  const tabs = NAV.filter(n => n.mobile);
  return <>
    <header className="es-safe-top sticky top-0 z-40 flex min-h-16 items-center justify-between gap-3 bg-gradient-to-l from-[var(--navy)] to-[#0b2a2f] px-3 text-white shadow-md sm:px-5 lg:hidden">
      <button type="button" aria-label="فتح قائمة التنقل" aria-expanded={open} onClick={() => setOpen(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 transition active:scale-95"><Icon name="more" size={22} /></button>
      <div className="min-w-0 flex-1 text-center">
        <div dir="ltr" className="flex items-center justify-center gap-1.5"><BrandMark size={22} /><Wordmark height={17} tone="onDark" /></div>
        <div className="mt-0.5 truncate text-[10px] text-white/60">المتابعة المالية · {title}</div>
      </div>
      <ThemeToggle label={false} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-lg" />
    </header>

    <nav aria-label="التنقل السريع" className="es-tabbar fixed inset-x-0 bottom-0 z-50 grid min-h-[76px] grid-cols-5 items-end rounded-t-[26px] bg-[var(--card)]/95 px-2 pt-2 pb-[max(10px,env(safe-area-inset-bottom))] shadow-[0_-12px_32px_rgba(16,72,79,0.14)] backdrop-blur-xl lg:hidden">
      {tabs.map(n => <Link key={n.href} href={n.href} aria-current={active === n.href ? "page" : undefined} className="es-tab focus-visible:outline-dashed">
        <span className="es-pill"><Icon name={n.icon} size={22} /></span><span className="es-tab-label">{n.label}</span></Link>)}
      <button type="button" onClick={() => setOpen(true)} className="es-tab focus-visible:outline-dashed"><span className="es-pill"><Icon name="more" size={22} /></span><span className="es-tab-label">المزيد</span></button>
    </nav>

    {open && <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="قائمة التنقل">
      <button type="button" aria-label="إغلاق قائمة التنقل" className="es-fade absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      <aside className="es-drawer absolute inset-y-0 right-0 flex w-[min(88vw,360px)] flex-col overflow-y-auto bg-gradient-to-b from-[#0d3a40] to-[#0b1d20] p-4 text-white shadow-2xl sm:p-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div><Logo variant="lockup" tone="onDark" markSize={36} /><div className="mt-1 text-xs text-white/60">المتابعة المالية</div></div>
          <button type="button" aria-label="إغلاق القائمة" onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10 transition active:scale-95"><Icon name="x" size={20} /></button>
        </div>
        <nav aria-label="التنقل الرئيسي" className="es-nav mt-4 flex flex-col gap-1">
          {NAV.map((n, k) => <Link key={n.href} href={n.href} onClick={() => setOpen(false)} data-on={active === n.href ? "1" : undefined} style={{ animationDelay: `${k * 30}ms` }} className={`es-link es-stagger ${active === n.href ? "es-link-solid" : ""}`}>
            <span className="es-ibox"><Icon name={n.icon} size={20} /></span><span className="es-label">{n.label}</span></Link>)}
        </nav>
        <form action="/api/auth/logout" method="post" className="mt-auto border-t border-white/10 pt-4"><button type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-red-500/90 px-4 text-sm font-extrabold text-white">تسجيل خروج</button></form>
      </aside>
    </div>}
  </>;
}
