import { Link, Route, Routes } from "react-router-dom";

function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold tracking-wide text-slate-500">
        SYLLABUSSYNC
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">
        Understand your workload. Own your semester.
      </h1>
      <p className="mt-4 max-w-xl text-lg leading-7 text-slate-600">
        Your academic workload workspace is being prepared.
      </p>
      <Link className="mt-8 w-fit text-sm font-medium text-slate-700 underline" to="/">
        Home
      </Link>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="*" element={<HomePage />} />
    </Routes>
  );
}
