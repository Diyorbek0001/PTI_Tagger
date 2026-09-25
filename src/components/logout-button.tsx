'use client';

import { usePathname } from 'next/navigation';

export function LogoutButton() {
  const pathname = usePathname();
  if (pathname === '/login') return null;
  return <button className="fixed right-5 top-5 z-20 rounded-lg border border-slate-700 bg-[#15191f]/90 px-3 py-2 text-sm font-semibold text-slate-300 shadow-lg shadow-black/30 backdrop-blur hover:border-slate-600 hover:bg-[#1d232b] hover:text-white" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.assign('/login'); }}>Sign out</button>;
}
