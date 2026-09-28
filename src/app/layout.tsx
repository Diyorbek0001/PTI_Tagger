import './globals.css';
import type { Metadata } from 'next';
import { LogoutButton } from '@/components/logout-button';
import { AppNav } from '@/components/app-nav';
export const metadata: Metadata = { title: 'PTI Tagger', description: 'Fleet PTI, defect, and compliance management' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><AppNav/><LogoutButton />{children}</body></html>; }
