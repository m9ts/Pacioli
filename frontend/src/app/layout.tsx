import type { Metadata } from 'next';
import { Baloo_2, Nunito } from 'next/font/google';
import { Providers } from '@/components/providers/app-providers';
import './globals.css';

const baloo2 = Baloo_2({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-baloo',
  display: 'swap',
});

const nunito = Nunito({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-nunito',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Pacioli',
    template: '%s | Pacioli',
  },
  description:
    'Simulador educacional de contabilidade empresarial: escrituração por partidas dobradas, estoque, ativos, depreciação e relatórios contábeis.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${baloo2.variable} ${nunito.variable}`}>
      <body className="min-h-screen font-body">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
