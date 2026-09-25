import './globals.css';
import type { Metadata } from 'next';
import { LogoutButton } from '@/components/logout-button';
export const metadata: Metadata = { title: 'PTI Registration', description: 'Telegram unit registration' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><LogoutButton />{children}</body></html>; }
