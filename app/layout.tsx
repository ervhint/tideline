import type { Metadata, Viewport } from 'next';
import { Inter, Overpass_Mono } from 'next/font/google';
import { Entrance, PRE_SCRIPT } from '@/components/Entrance';
import { Nav } from '@/components/Nav';
import { Plate } from '@/components/Plate';
import './globals.css';
import './reference.css';

const inter = Inter({ subsets: ['latin'], display: 'block', variable: '--font-inter' });
const mono = Overpass_Mono({ subsets: ['latin'], weight: ['400'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Tideline: How Much Fee Volume Does NEAR Need?',
  description: 'A re-runnable investment thesis for NEAR, built on NEAR Intents fee data.',
};

export const viewport: Viewport = { themeColor: '#E6EDF6', viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PRE_SCRIPT }} />
      </head>
      <body>
        <Plate />
        <Nav />
        {children}
        <Entrance />
      </body>
    </html>
  );
}
