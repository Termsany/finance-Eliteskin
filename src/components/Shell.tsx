import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SidebarToggle } from "@/components/SidebarNav";
import { SideMenu, MobileMenu } from "@/components/AppNav";

/** Same frame as «الميدان»: dark sidebar on desktop, top bar + bottom tabs on phones. */
export function Shell({ children }: { children: React.ReactNode }) {
  return <div className="es-shell min-h-screen flex flex-col lg:flex-row" dir="rtl">
    <aside className="es-sidebar hidden lg:flex shrink-0 flex-col text-white sticky top-0 h-screen">
      <div className="es-head flex items-center justify-between gap-2">
        <div className="es-hide"><Logo variant="lockup" tone="onDark" markSize={38} tagline="المتابعة المالية" /></div>
        <div className="es-show-c"><Logo variant="mark" tone="onDark" markSize={40} /></div>
        <SidebarToggle />
      </div>
      <Suspense fallback={null}><SideMenu /></Suspense>
      <div className="es-user mt-auto rounded-2xl bg-white/[0.07] p-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--sky)] text-xs font-extrabold text-[#0b1d20]">ES</div>
          <div className="es-hide min-w-0 flex-1"><div className="truncate text-sm font-bold">المالك</div><div className="truncate text-[11px] text-[var(--sky)]">المتابعة المالية</div></div>
        </div>
        <div className="es-hide mt-2 flex gap-1.5">
          <ThemeToggle className="flex flex-1 items-center justify-center gap-1 rounded-full bg-white/10 py-2 text-xs font-bold transition hover:bg-white/20" />
          <form action="/api/auth/logout" method="post" className="flex-1"><button type="submit" className="w-full rounded-full bg-white/10 py-2 text-xs font-bold transition hover:bg-white/20">تسجيل خروج</button></form>
        </div>
      </div>
    </aside>
    <div className="flex min-w-0 flex-1 flex-col">
      <Suspense fallback={null}><MobileMenu /></Suspense>
      <main className="es-page flex-1 p-4 pb-28 sm:p-5 sm:pb-28 lg:p-8 lg:pb-8">{children}</main>
    </div>
  </div>;
}
