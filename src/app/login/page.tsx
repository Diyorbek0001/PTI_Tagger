import { LoginForm } from '@/components/login-form';

export default function LoginPage() {
  return <main className="grid min-h-screen place-items-center p-6"><section className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#15191f] p-8 shadow-2xl shadow-black/40"><p className="text-sm font-semibold text-blue-400">PTI · Fleet Management</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Admin sign in</h1><p className="mt-3 text-slate-400">Enter the private credentials configured for this website.</p><LoginForm /></section></main>;
}
