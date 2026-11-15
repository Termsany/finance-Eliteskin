import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ThemeToggle } from "@/components/ThemeToggle";

/** Top bar for every signed-in page: brand, the two pages, theme and sign out. */
export function Shell({ active, children }: { active: "/" | "/settings"; children: React.ReactNode }) {
  const link = (href: "/" | "/settings", label: string, icon: string) => <Link href={href} aria-current={active === href ? "page" : undefined}
    className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold transition ${active === href ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10 hover:text-white"}`}><Icon name={icon} size={16} />{label}</Link>;
  return <div className="min-h-screen" dir="rtl">
    <header className="sticky top-0 z-50 bg-[linear-gradient(180deg,#0d3a40_0%,#0b1d20_100%)] text-white shadow-lg">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--sky)] text-[#0b1d20]"><Icon name="wallet" size={19} /></span>
          <span className="leading-tight"><b className="block text-[15px]">المتابعة المالية</b><span className="text-[11px] text-white/60">Elite Skin</span></span></Link>
        <nav className="mr-auto flex items-center gap-1">{link("/", "الحسابات", "dashboard")}{link("/settings", "الإعدادات", "pen")}</nav>
        <ThemeToggle className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/20" />
        <form action="/api/auth/logout" method="post"><button type="submit" className="rounded-full bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/20">خروج</button></form>
      </div>
    </header>
    <main className="mx-auto max-w-[1320px] px-4 py-5 sm:px-6 sm:py-6">{children}</main>
  </div>;
}
