"use client";
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return <html lang="ar" dir="rtl"><body className="grid min-h-dvh place-items-center bg-[#f7f8fa] font-sans text-[#0b1d20]">
    <div className="mx-auto max-w-md rounded-3xl border bg-white p-8 text-center shadow-sm">
      <h1 className="text-xl font-extrabold">تعذر تحميل الصفحة</h1>
      <p className="mt-2 text-sm text-gray-500">حصل خطأ غير متوقع — جرّب تحدّث الصفحة.</p>
      <button type="button" onClick={() => reset()} className="mt-4 rounded-full bg-[#0b1d20] px-5 py-2.5 text-sm font-bold text-white">حاول تاني</button>
    </div>
  </body></html>;
}
