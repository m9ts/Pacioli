'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Building2,
  ClipboardList,
  Landmark,
  Scale,
  TrendingUp,
  Warehouse,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, SOURCE_LABELS } from '@/lib/format';
import type { DashboardData } from '@/lib/types';
import { useAuth } from '@/components/providers/auth-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const PIE_COLORS = ['#12304f', '#2b5591', '#3a6bab', '#94b4d9', '#c9a227', '#e0b23c', '#875e1a'];

export default function DashboardPage() {
  const { company, loading: authLoading } = useAuth();
  const enabled = Boolean(company);

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', company?.id],
    enabled,
    queryFn: async () => {
      const { data: result } = await api.get<DashboardData>('/reports/dashboard');
      return result;
    },
  });

  if (authLoading) return <div className="py-20 text-center text-slate-400">Carregando…</div>;

  if (!company) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle>Nenhuma empresa selecionada</CardTitle>
          <CardDescription>
            Crie ou selecione uma empresa simulada para começar a praticar contabilidade.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/app/empresas">
              <Building2 className="h-4 w-4" />
              Ir para Minhas Empresas
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return <div className="py-20 text-center text-slate-400">Carregando painel…</div>;
  }

  if (error || !data) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle>Não foi possível carregar o painel</CardTitle>
          <CardDescription>
            Verifique se a API está em execução e se a empresa está ativa.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const cards = [
    {
      label: 'Ativo Total',
      value: data.cards.totalAtivo,
      icon: Scale,
      tone: 'text-navy-700',
    },
    {
      label: 'Patrimônio Líquido',
      value: data.cards.patrimonioLiquido,
      icon: Landmark,
      tone: 'text-emerald-700',
    },
    {
      label: 'Receita (exercício)',
      value: data.cards.receitaTotal,
      icon: TrendingUp,
      tone: 'text-navy-700',
    },
    {
      label: 'Resultado do Exercício',
      value: data.cards.resultadoExercicio,
      icon: data.cards.resultadoExercicio >= 0 ? ArrowUpRight : ArrowDownRight,
      tone: data.cards.resultadoExercicio >= 0 ? 'text-emerald-700' : 'text-red-600',
    },
    {
      label: 'Estoque',
      value: data.cards.estoqueValor,
      icon: Boxes,
      tone: 'text-gold-600',
    },
    {
      label: 'Despesas totais',
      value: data.cards.despesasTotais,
      icon: Warehouse,
      tone: 'text-slate-600',
    },
  ];

  const monthly = data.monthly.map((row) => ({
    ...row,
    receita: Number(row.receita.toFixed(2)),
    despesas: Number(row.despesas.toFixed(2)),
    resultado: Number(row.resultado.toFixed(2)),
  }));

  const composition = Object.entries(data.composition)
    .filter(([, value]) => Math.abs(value) > 0.005)
    .map(([key, value]) => ({ name: key, value: Number(value.toFixed(2)) }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 font-display text-navy-900">Painel</h1>
          <p className="text-body-sm text-slate-500">
            {company.legalName} — situação contábil em {formatDate(data.date)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/app/diario">
              <ClipboardList className="h-4 w-4" />
              Novo lançamento
            </Link>
          </Button>
        </div>
      </div>

      {/* Cards resumo */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="flex items-center gap-4 pt-5">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-slate-100 ${card.tone}`}>
                <card.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-body-sm text-slate-500">{card.label}</p>
                <p className={`truncate text-h2 font-display ${card.tone}`}>
                  {formatCurrency(card.value)}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Receitas × Despesas por mês</CardTitle>
            <CardDescription>Exercício corrente (sem considerar o encerramento)</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => formatCurrency(value, '')} width={70} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="receita" name="Receitas" fill="#3a6bab" radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesas" name="Despesas" fill="#c9a227" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resultado mensal</CardTitle>
            <CardDescription>Lucro ou prejuízo acumulado por mês</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => formatCurrency(value, '')} width={70} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Line
                  type="monotone"
                  dataKey="resultado"
                  name="Resultado"
                  stroke="#12304f"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Composição + estoque */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Composição do Balanço</CardTitle>
            <CardDescription>Distribuição dos grupos patrimoniais</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {composition.length === 0 ? (
              <p className="py-10 text-center text-body-sm text-slate-400">Sem dados ainda.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={composition} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
                    {composition.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Últimos lançamentos</CardTitle>
            <CardDescription>Movimentações recentes no Livro Diário</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-100">
              {data.recentEntries.slice(0, 6).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-body-sm font-semibold text-navy-900">
                      #{entry.number} — {entry.history}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDate(entry.date)} · {SOURCE_LABELS[entry.source] ?? entry.source}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-body-sm font-semibold tabular">{formatCurrency(entry.totalDebit)}</p>
                    {entry.lines?.length > 1 && (
                      <Badge variant="outline">{entry.lines.length} contas</Badge>
                    )}
                  </div>
                </div>
              ))}
              {data.recentEntries.length === 0 && (
                <p className="py-8 text-center text-body-sm text-slate-400">
                  Nenhum lançamento ainda.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
