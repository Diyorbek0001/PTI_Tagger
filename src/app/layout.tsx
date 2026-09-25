import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'PTI Registration', description: 'Telegram unit registration' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
