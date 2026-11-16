"use client";
import { useEffect } from "react";

/** Top bar of the printable report (hidden when printing); opens the print dialog once on load. */
export default function PrintBar({ back }: { back: string }) {
  useEffect(() => { const t = setTimeout(() => window.print(), 600); return () => clearTimeout(t); }, []);
  return <div className="no-print" style={{ maxWidth: "210mm", margin: "0 auto 12px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
    <button type="button" onClick={() => window.print()} style={{ background: "#10484f", color: "#fff", border: 0, borderRadius: 999, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>اطبع / احفظ PDF</button>
    <a href={back} style={{ color: "#10484f", fontWeight: 700, fontSize: 13, padding: "9px 12px" }}>رجوع للبرنامج</a>
    <span style={{ color: "#5f7177", fontSize: 12 }}>في نافذة الطباعة اختار «حفظ كـ PDF» (Save as PDF).</span>
  </div>;
}
