import type { PropsWithChildren } from 'react';

const AppShell = ({ children }: PropsWithChildren) => {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 text-slate-100">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-cyan-500/40 blur-[120px]" />
      <div className="pointer-events-none absolute -right-16 top-32 h-64 w-64 rounded-full bg-purple-500/30 blur-[100px]" />

      <main className="relative z-10 flex min-h-screen w-full flex-col">
        {children}
      </main>
    </div>
  );
};

export default AppShell;
