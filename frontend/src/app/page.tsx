'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ChevronRight, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { PacioliPortrait } from '@/components/pacioli-portrait';
import { useAuth } from '@/components/providers/auth-provider';
import { cn } from '@/lib/utils';

export default function LandingPage() {
  const router = useRouter();
  const { user, startGuest } = useAuth();
  const [starting, setStarting] = React.useState<'company' | 'spreadsheet' | null>(null);

  async function go(target: 'company' | 'spreadsheet') {
    setStarting(target);
    try {
      if (!user) await startGuest();
      router.push(target === 'company' ? '/app/empresas?nova=1' : '/app/importar-planilha');
    } catch (error: any) {
      toast.error(error?.message ?? 'Não foi possível iniciar a sessão de visitante.');
      setStarting(null);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#faf7f2] px-6 py-12">
      {/* Textura suave de papel */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 0%, #f9edd6 0%, transparent 55%), radial-gradient(90% 70% at 50% 100%, #f4ecdf 0%, transparent 60%)',
        }}
      />

      <div className="relative flex w-full max-w-3xl flex-col items-center">
        <div className="animate-fade-up flex flex-col items-center gap-4 text-center">
          <PacioliPortrait className="h-44 w-36 text-navy-500 sm:h-56 sm:w-44" />

          <h1 className="text-4xl font-bold tracking-tight text-navy-900 sm:text-5xl">Pacioli</h1>
          <p className="max-w-md text-body text-navy-600">
            A contabilidade empresarial na prática — partidas dobradas, estoque, ativos e
            relatórios em um simulador educacional.
          </p>
        </div>

        <div className="animate-fade-up mt-8 grid w-full gap-4 sm:grid-cols-2 [animation-delay:0.15s]">
          <OptionCard
            icon={<Building2 className="h-7 w-7" />}
            title="Começar nova empresa"
            description="Crie uma empresa simulada, defina o capital social e registre o patrimônio inicial."
            cta="Criar empresa"
            loading={starting === 'company'}
            disabled={starting !== null}
            onClick={() => go('company')}
          />
          <OptionCard
            icon={<FileSpreadsheet className="h-7 w-7" />}
            title="Carregar planilha"
            description="Importe uma planilha .xlsx ou .csv com bens, direitos e obrigações da abertura."
            cta="Enviar planilha"
            loading={starting === 'spreadsheet'}
            disabled={starting !== null}
            onClick={() => go('spreadsheet')}
          />
        </div>

        <div className="animate-fade-up mt-6 [animation-delay:0.3s]">
          <p className="text-center text-xs text-navy-400">
            Inspirado em Luca Pacioli, pai da contabilidade por partidas dobradas (1494).
          </p>
        </div>
      </div>
    </main>
  );
}

function OptionCard({
  icon,
  title,
  description,
  cta,
  loading,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group flex flex-col items-start gap-4 rounded-2xl border border-navy-200 bg-white p-6 text-left shadow-card transition-all',
        'hover:-translate-y-0.5 hover:border-gold-400 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/50',
        'disabled:pointer-events-none disabled:opacity-60',
      )}
    >
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-gold-100 text-navy-700 transition-colors group-hover:bg-gold-200">
        {icon}
      </span>
      <span>
        <span className="block text-lg font-bold text-navy-900">{title}</span>
        <span className="mt-1 block text-body-sm text-navy-600">{description}</span>
      </span>
      <span className="mt-auto inline-flex items-center gap-1 text-body-sm font-bold text-navy-700">
        {loading ? 'Preparando…' : cta}
        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}
