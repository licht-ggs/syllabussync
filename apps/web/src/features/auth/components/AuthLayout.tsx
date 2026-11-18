import type { ReactNode } from "react";

export function AuthLayout({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section
        aria-labelledby="page-title"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <p className="text-sm font-semibold tracking-wide text-slate-500">
          SYLLABUSSYNC
        </p>
        <h1
          className="mt-5 text-2xl font-semibold tracking-tight text-slate-900"
          id="page-title"
        >
          {title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        {children}
      </section>
    </main>
  );
}

export function FormMessage({
  children,
  kind,
}: {
  children: ReactNode;
  kind: "error" | "success" | "info";
}) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-slate-200 bg-slate-50 text-slate-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };

  return (
    <p
      className={`mt-4 rounded-lg border px-3 py-2 text-sm ${styles[kind]}`}
      role={kind === "error" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}
