import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../context/AuthContext';
import { NavigationProvider } from '../context/NavigationContext';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';

export const metadata: Metadata = {
  title: 'Locket Web - Edit & Post Moments',
  description: 'Upload, crop, edit with filters, and post moments to your Locket widget.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0D0E12] text-white flex flex-col min-h-screen">
        <AuthProvider>
          <NavigationProvider>
            <Header />
            <main className="flex-1 flex flex-col">{children}</main>
            <BottomNav />
          </NavigationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
