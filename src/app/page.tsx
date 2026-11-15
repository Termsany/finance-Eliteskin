import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { daftraCfg } from "@/lib/settings";
import { syncIfStale } from "@/lib/daftra";
import { Shell } from "@/components/Shell";
import AccountsHub from "./accounts/AccountsHub";

export const dynamic = "force-dynamic";

/** The books: customers, suppliers, expenses, profit & loss, VAT, cash and audit — all from the Daftra mirror. */
export default async function Home() {
  if (!(await getCurrentUser())) redirect("/login");
  const cfg = await daftraCfg();
  if (cfg) await syncIfStale(60);
  return <Shell active="/">
    {cfg ? <AccountsHub subdomain={`${cfg.sub}.${cfg.domain}`} />
      : <div className="mx-auto max-w-xl rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 text-center">
        <h1 className="text-xl font-extrabold">أهلاً بيك في المتابعة المالية</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">عشان الأرقام تظهر، اربط البرنامج بحسابك في دفترة. البرنامج بيقرأ من دفترة بس، ومش بيعدّل فيها حاجة.</p>
        <a href="/settings" className="mt-4 inline-block rounded-full bg-[var(--navy)] px-5 py-2.5 text-sm font-bold text-white">اربط دفترة من الإعدادات</a>
      </div>}
  </Shell>;
}
