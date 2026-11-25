'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, FileDown, FileSpreadsheet, Warehouse } from 'lucide-react';
import { toast } from 'sonner';
import { api, downloadFile } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Asset } from '@/lib/types';
import { useAuth } from '@/components/providers/auth-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyCompany } from '@/components/empty-company';

interface DepreciationRow {
  assetId: string;
  code: string;
  name: string;
  alreadyPosted: boolean;
  eligible: boolean;
  amount: number;
  remaining: number;
}

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export default function DepreciacaoPage() {
  const { company, user } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = company?.canWrite !== false && user?.role !== 'PROFESSOR';

  const [period, setPeriod] = React.useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [saving, setSaving] = React.useState(false);

  const assets = useQuery({
    enabled: Boolean(company),
    queryKey: ['assets', company?.id],
    queryFn: async () => {
      const { data } = await api.get<{
        rows: Asset[];
        totals: { cost: number; accumulatedDepreciation: number; bookValue: number; count: number };
      }>('/assets');
      return data;
    },
  });

  const preview = useQuery({
    enabled: Boolean(company),
    queryKey: ['dep-preview', company?.id, period.year, period.month],
    queryFn: async () => {
      const { data } = await api.get<{
        rows: DepreciationRow[];
        total: number;
        eligibleCount: number;
      }>('/assets/depreciation/preview', {
        params: { year: period.year, month: period.month },
      });
      return data;
    },
  });

  async function submitDepreciation() {
    setSaving(true);
    try {
      const { data } = await api.post('/assets/depreciation', {
        year: period.year,
        month: period.month,
      });
      toast.success(data.message ?? 'Depreciação contabilizada.');
      void queryClient.invalidateQueries();
    } catch (error: any) {
      toast.error(error?.message ?? 'Falha na depreciação.');
    } finally {
      setSaving(false);
    }
  }

  async function exportReport(format: 'xlsx' | 'pdf') {
    try {
      await downloadFile('/export/assets', { format }, `ativos.${format}`);
    } catch {
      toast.error('Falha na exportação.');
    }
  }

  if (!company) return <EmptyCompany />;

  const totals = assets.data?.totals;
  const eligibleCount = preview.data?.eligibleCount ?? 0;
  const monthTotal = preview.data?.total ?? 0;

  const cards = [
    { label: 'Ativos cadastrados', value: String(totals?.count ?? 0), tone: 'text-navy-900' },
    {
      label: 'Custo de aquisição',
      value: formatCurrency(totals?.cost ?? 0),
      tone: 'text-navy-900',
    },
    {
      label: 'Depreciação acumulada',
      value: formatCurrency(totals?.accumulatedDepreciation ?? 0),
      tone: 'text-amber-600',
    },
    {
      label: 'Valor líquido contábil',
      value: formatCurrency(totals?.bookValue ?? 0),
      tone: 'text-emerald-700',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 font-display text-navy-900">Depreciação</h1>
          <p className="text-body-sm text-slate-500">
            Depreciação mensal do imobilizado pelo método linear, com lançamento automático no
            Livro Diário.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportReport('xlsx')}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportReport('pdf')}>
            <FileDown className="h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/app/ativos">
              <Warehouse className="h-4 w-4" /> Gerenciar ativos
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="pt-5">
              <p className="text-body-sm text-slate-500">{card.label}</p>
              <p className={`text-h2 font-display tabular ${card.tone}`}>{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fechamento do mês</CardTitle>
          <CardDescription>
            Escolha o mês, confira o valor apurado de cada bem e contabilize a depreciação de uma só
            vez.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Ano" className="w-32">
              <Select
                value={String(period.year)}
                onValueChange={(value) =>
                  setPeriod((prev) => ({ ...prev, year: Number(value) }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 11 }, (_, index) => new Date().getFullYear() - 3 + index).map(
                    (year) => (
                      <SelectItem key={year} value={String(year)}>
                        {year}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Mês" className="w-44">
              <Select
                value={String(period.month)}
                onValueChange={(value) =>
                  setPeriod((prev) => ({ ...prev, month: Number(value) }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month, index) => (
                    <SelectItem key={month} value={String(index + 1)}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="ml-auto flex items-end gap-3">
              <div className="text-right">
                <p className="text-body-sm text-slate-500">Total do mês</p>
                <p className="text-h2 font-display text-navy-900 tabular">
                  {formatCurrency(monthTotal)}
                </p>
              </div>
              {canWrite && (
                <Button
                  onClick={submitDepreciation}
                  disabled={saving || eligibleCount === 0 || preview.isLoading}
                >
                  <CalendarClock className="h-4 w-4" />
                  {saving ? 'Contabilizando…' : 'Contabilizar depreciação'}
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/60">
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Valor do mês</TableHead>
                  <TableHead className="text-right">Saldo a depreciar</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.isLoading && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-slate-400">
                      Calculando depreciação do mês…
                    </TableCell>
                  </TableRow>
                )}
                {!preview.isLoading && (preview.data?.rows.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-slate-400">
                      Nenhum ativo cadastrado. Cadastre um bem em{' '}
                      <Link href="/app/ativos" className="font-semibold text-navy-700 underline">
                        Ativos
                      </Link>
                      .
                    </TableCell>
                  </TableRow>
                )}
                {(preview.data?.rows ?? []).map((row) => (
                  <TableRow key={row.assetId}>
                    <TableCell>
                      <span className="font-medium">{row.name}</span>
                      <span className="block text-xs text-slate-400">{row.code}</span>
                    </TableCell>
                    <TableCell className="text-right tabular">{formatCurrency(row.amount)}</TableCell>
                    <TableCell className="text-right tabular text-slate-500">
                      {formatCurrency(row.remaining)}
                    </TableCell>
                    <TableCell>
                      {row.alreadyPosted ? (
                        <Badge variant="outline">Já contabilizado</Badge>
                      ) : row.eligible ? (
                        <Badge variant="success">Elegível</Badge>
                      ) : (
                        <Badge variant="warning">Fora da janela</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <p className="text-body-sm text-slate-500">
            {eligibleCount} ativo(s) elegível(is) em {MONTHS[period.month - 1]}/{period.year}. O
            lançamento débito em <strong>Despesa de Depreciação</strong> e crédito em{' '}
            <strong>Depreciação Acumulada</strong> é gerado automaticamente.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Depreciação acumulada por ativo</CardTitle>
          <CardDescription>
            Cada bem aparece com a depreciação já acumulada e a parcela mensal calculada.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/60">
                <TableHead className="w-24">Código</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="w-28">Aquisição</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Mensal</TableHead>
                <TableHead className="text-right">Deprec. acum.</TableHead>
                <TableHead className="text-right">Líquido</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-slate-400">
                    Carregando ativos…
                  </TableCell>
                </TableRow>
              )}
              {assets.data?.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-slate-400">
                    Nenhum ativo registrado.
                  </TableCell>
                </TableRow>
              )}
              {assets.data?.rows.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell className="text-slate-500">{asset.code}</TableCell>
                  <TableCell>
                    <span className="font-medium">{asset.name}</span>
                    {asset.location && (
                      <span className="block text-xs text-slate-400">{asset.location}</span>
                    )}
                  </TableCell>
                  <TableCell>{formatDate(asset.acquisitionDate)}</TableCell>
                  <TableCell className="text-right tabular">
                    {formatCurrency(asset.acquisitionValue)}
                  </TableCell>
                  <TableCell className="text-right tabular text-slate-500">
                    {formatCurrency(asset.monthlyDepreciation)}
                  </TableCell>
                  <TableCell className="text-right tabular text-amber-700">
                    {formatCurrency(asset.accumulatedDepreciation)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular">
                    {formatCurrency(asset.bookValue)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        asset.status === 'ATIVO'
                          ? 'success'
                          : asset.status === 'BAIXADO'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {asset.status === 'ATIVO'
                        ? 'Ativo'
                        : asset.status === 'BAIXADO'
                          ? 'Baixado'
                          : 'Transferido'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
