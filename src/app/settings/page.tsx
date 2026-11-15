import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { Shell } from "@/components/Shell";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!(await getCurrentUser())) redirect("/login");
  return <Shell><h1 className="text-2xl font-extrabold text-[var(--ink)]">الإعدادات</h1><SettingsClient /></Shell>;
}
