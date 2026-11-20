import { AcademicWorkspace } from "./AcademicWorkspace";

export function ArchivesPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Archives
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Restore archived academic periods and subjects, or permanently
            delete archived records.
          </p>
        </header>
        <AcademicWorkspace view="archive" />
      </div>
    </main>
  );
}
