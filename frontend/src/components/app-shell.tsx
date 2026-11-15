'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BookOpenCheck,
  BookText,
  Building2,
  ChevronsUpDown,
  ClipboardList,
  FileSpreadsheet,
  FileUp,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ScrollText,
  Settings,
  Truck,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/components/providers/auth-provider';
import { PacioliPortrait } from '@/components/pacioli-portrait';
import { downloadFile } from '@/lib/api';
import { ROLE_LABELS, STATUS_LABELS } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const NAV_ITEMS = [
  { href: '/app/dashboard', label: 'Painel', icon: LayoutDashboard },
  { href: '/app/diario', label: 'Livro Diário', icon: BookText },
  { href: '/app/razao', label: 'Livro Razão', icon: ScrollText },
  { href: '/app/balancete', label: 'Balancete', icon: ClipboardList },
  { href: '/app/balanco', label: 'Balanço Patrimonial', icon: FileSpreadsheet },
  { href: '/app/dre', label: 'DRE & Encerramento', icon: FileSpreadsheet },
  { href: '/app/plano-de-contas', label: 'Plano de Contas', icon: BookOpenCheck },
  { href: '/app/estoque', label: 'Estoque', icon: Package },
  { href: '/app/ativos', label: 'Ativos & Depreciação', icon: Warehouse },
  { href: '/app/cadastros', label: 'Clientes & Fornecedores', icon: Truck },
  { href: '/app/empresas', label: 'Minhas Empresas', icon: Building2 },
  { href: '/app/importar-planilha', label: 'Importar Planilha', icon: FileUp },
  { href: '/app/configuracoes', label: 'Configurações', icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-body-sm font-semibold transition-colors',
              active
                ? 'bg-navy-800 text-white'
                : 'text-navy-200 hover:bg-navy-800/60 hover:text-white',
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function CompanySwitcher() {
  const { company, companies, selectCompany } = useAuth();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-full w-full justify-between gap-2 px-3 py-2 text-left">
          <span className="flex min-w-0 items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-gold-400" />
            <span className="min-w-0">
              <span className="block truncate text-body-sm font-semibold text-white">
                {company?.tradeName ?? 'Sem empresa'}
              </span>
              <span className="block truncate text-xs text-navy-300">
                {company ? ROLE_LABELS[company.accessRole] ?? company.accessRole : 'Selecione'}
              </span>
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-navy-300" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Empresas</DropdownMenuLabel>
        {companies.map((item) => (
          <DropdownMenuItem key={item.id} onClick={() => selectCompany(item.id)}>
            <Building2 className="h-4 w-4 text-navy-600" />
            <span className="min-w-0 flex-1 truncate">{item.tradeName}</span>
            <Badge variant={item.status === 'ACTIVE' ? 'success' : 'warning'} className="ml-auto">
              {STATUS_LABELS[item.status] ?? item.status}
            </Badge>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => (window.location.href = '/app/empresas')}>
          <Building2 className="h-4 w-4" />
          Gerenciar empresas
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, company, loading, logout } = useAuth();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    if (!loading && !user) router.replace('/');
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100">
        <div className="flex flex-col items-center gap-3">
          <span className="grid h-12 w-12 animate-pulse place-items-center rounded-xl bg-navy-900 text-white">
            <BookOpenCheck className="h-6 w-6" />
          </span>
          <p className="text-body-sm text-slate-500">Carregando Pacioli…</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const sidebar = (
    <div className="flex h-full w-64 flex-col bg-navy-900">
      <div className="flex items-center gap-3 px-4 py-4">
        <PacioliPortrait className="h-10 w-9 shrink-0 text-white" />
        <div>
          <p className="font-display text-lg leading-none text-white">Pacioli</p>
          <p className="text-xs text-navy-300">Simulador contábil</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto text-navy-300 lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="border-y border-navy-800">
        <CompanySwitcher />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <NavLinks onNavigate={() => setMobileOpen(false)} />
      </div>

      <div className="border-t border-navy-800 p-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-navy-700 text-xs font-bold text-white">
            {user?.name?.slice(0, 2).toUpperCase() ?? '—'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-sm font-semibold text-white">{user?.name}</p>
            <p className="truncate text-xs text-navy-300">{user ? ROLE_LABELS[user.role] : ''}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-navy-300 hover:text-white"
            onClick={async () => {
              await logout();
            }}
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen shrink-0 lg:block">{sidebar}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 z-50">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            {company && (
              <p className="truncate text-body-sm text-slate-500">
                {company.legalName}
                {company.cnpj ? ` — CNPJ ${company.cnpj}` : ''}
              </p>
            )}
          </div>
          {company?.canWrite === false && (
            <Badge variant="outline" className="hidden sm:inline-flex">
              Modo leitura
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!company) return;
              try {
                await downloadFile('/export/trial-balance', { format: 'pdf' }, 'balancete.pdf');
              } catch {
                toast.error('Falha na exportação.');
              }
            }}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Exportar balancete
          </Button>
          {user?.role === 'ADMIN' && (
            <Button variant="ghost" size="sm" onClick={() => router.push('/app/admin/usuarios')}>
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Usuários</span>
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </header>

        <main className="flex-1 bg-slate-100 px-4 py-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
