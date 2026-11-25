'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown, FileSpreadsheet, Lock, LockOpen } from 'lucide-react';
import { toast } from 'sonner';
import { api, downloadFile } from '@/lib/api';
import { formatCurrency, formatDate, STATUS_LABELS } from '@/lib/format';
import type { Period } from '@/lib/types';
import { useAuth } from '@/components/providers/auth-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { EmptyCompany } from '@/components/empty-company';

interface DreAccount {
  id: string;
  code: string;
  name: string;
  amount: number;
}
interface DreGroup {
  key: string;
  label: string;
  kind: 'receita' | 'despesa';
  accounts: DreAccount[];
  total: number;
}
interface DreSummary {
  receitaBruta: number;
  deducoes: number;
  receitaLiquida: number;
  cmv: number;
  lucroBruto: number;
  despesasOperacionais: number;
  resultadoOperacional: number;
  resultadoAntesTributos: number;
  tributos: number;
  resultadoLiquido: number;
  margemLiquida: number;
  totalDespesasOperacionais?: number;
  despesasAdministrativas?: number;
  despesasVendas?: number;
}
interface DreData {
  from: string;
  to: string;
  groups: DreGroup[];
  summary: DreSummary;
  previous: { from: string; to: string; summary: DreSummary } | null;
}

function normalizeSummary(summary: DreSummary): DreSummary {
  const despesasOperacionais =
    summary.despesasOperacionais ??
    summary.totalDespesasOperacionais ??
    (summary.despesasAdministrativas ?? 0) + (summary.despesasVendas ?? 0);
  return {
    ...summary,
    despesasOperacionais,
    resultadoOperacional:
      summary.resultadoOperacional ??
      Number((summary.lucroBruto - despesasOperacionais).toFixed(2)),
  };
}

const SUMMARY_LINES: { key: keyof DreSummary | 'saldo'; label: string; signed?: 'deducao' | 'soma'; strong?: boolean }[] = [
  { key: 'receitaBruta', label: 'Receita Bruta de Vendas', strong: true },
  { key: 'deducoes', label: '(-) Deduções da Receita', signed: 'deducao' },
  { key: 'receitaLiquida', label: '= Receita Líquida', strong: true },
  { key: 'cmv', label: '(-) Custo das Mercadorias Vendidas', signed: 'deducao' },
  { key: 'lucroBruto', label: '= Lucro Bruto', strong: true },
  { key: 'despesasOperacionais', label: '(-) Despesas Operacionais', signed: 'deducao' },
  { key: 'resultadoOperacional', label: '= Resultado Operacional', strong: true },
  { key: 'resultadoAntesTributos', label: '= Resultado antes dos Tributos' },
  { key: 'tributos', label: '(-) Tributos sobre o Lucro', signed: 'deducao' },
  { key: 'resultadoLiquido', label: '= RESULTADO LÍQUIDO DO EXERCÍCIO', strong: true },
];

export default function DrePage() {
  const { company, user } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = company?.canWrite !== false && user?.role !== 'PROFESSOR';
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [compare, setCompare] = React.useState(false);
  const [closingOpen, setClosingOpen] = React.useState(false);
  const [closingDate, setClosingDate] = React.useState('');
  const [closing, setClosing] = React.useState(false);

  const dre = useQuery({
    enabled: Boolean(company),
    queryKey: ['dre', company?.id, from, to, compare],
    queryFn: async () => {
      const { data } = await api.get<DreData>('/reports/dre', {
        params: { from: from || undefined, to: to || undefined, compare: compare ? 'true' : undefined },
      });
      return {
        ...data,
        summary: normalizeSummary(data.summary),
        previous: data.previous
          ? { ...data.previous, summary: normalizeSummary(data.previous.summary) }
          : null,
      };
    },
  });

  const periods = useQuery({
    enabled: Boolean(company),
    queryKey: ['periods', company?.id],
    queryFn: async () => {
      const { data } = await api.get<Period[]>('/periods');
      return data;
    },
  });

  const openPeriod = (periods.data ?? []).find((period) => period.status === 'OPEN') ?? null;

  const preview = useQuery({
    enabled: closingOpen && Boolean(openPeriod),
    queryKey: ['closing-preview', company?.id, openPeriod?.id],
    queryFn: async () => {
      const { data } = await api.get('/reports/closing/preview', {
        params: { periodId: openPeriod!.id },
      });
      return data as {
        alreadyClosed: boolean;
        closing: { lines: { accountId: string; debit: number; credit: number }[]; totalDebit: number; totalCredit: number; result: number };
        transfer: { lines: unknown[]; total: number };
        result: number;
      };
    },
  });

  async function executeClosing() {
    if (!openPeriod) return;
    setClosing(true);
    try {
      const { data } = await api.post('/reports/closing', {
        periodId: openPeriod.id,
        ...(closingDate ? { date: closingDate } : {}),
      });
      toast.success(data.message ?? 'Período encerrado.');
      setClosingOpen(false);
      void queryClient.invalidateQueries();
    } catch (error: any) {
      toast.error(error?.message ?? 'Falha no encerramento.');
    } finally {
      setClosing(false);
    }
  }

  async function exportReport(format: 'xlsx' | 'pdf') {
    try {
      await downloadFile(
        '/export/dre',
        { format, from: from || undefined, to: to || undefined },
        `dre.${format}`,
      );
    } catch {}
  }

  if (!company) return <EmptyCompany />;
  const summary = dre.data?.summary;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 font-display text-navy-900">DRE — Demonstração do Resultado</h1>
          <p className="text-body-sm text-slate-500">
            {dre.data ? `Período: ${formatDate(dre.data.from)} a ${formatDate(dre.data.to)}` : 'Exercício corrente'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="De" className="w-36">
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label="Até" className="w-36">
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
          <label className="flex h-10 items-center gap-2 text-body-sm">
            <input
              type="checkbox"
              checked={compare}
              onChange={(event) => setCompare(event.target.checked)}
              className="h-4 w-4 accent-navy-700"
            />
            Comparar com período anterior
          </label>
          <Button variant="outline" size="sm" onClick={() => exportReport('xlsx')}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportReport('pdf')}>
            <FileDown className="h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      {dre.isLoading ? (
        <p className="py-16 text-center text-slate-400">Calculando DRE…</p>
      ) : !summary ? (
        <Card>
          <CardContent className="py-16 text-center text-slate-400">Não foi possível calcular a DRE.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          {/* Estrutura da DRE */}
          <Card>
            <CardHeader>
              <CardTitle>Estrutura do Resultado</CardTitle>
              <CardDescription>
                Margem líquida: <strong>{summary.margemLiquida}%</strong> sobre a receita líquida
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/60">
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-40 text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SUMMARY_LINES.map((line) => {
                    const raw = Number(summary[line.key as keyof DreSummary] ?? 0);
                    const value = line.signed === 'deducao' ? -raw : raw;
                    const isResult = line.key === 'resultadoLiquido';
                    return (
                      <TableRow
                        key={line.key}
                        className={cn(isResult && 'bg-navy-50 font-bold', line.strong && 'font-semibold')}
                      >
                        <TableCell className={cn(line.strong && 'text-navy-900')}>{line.label}</TableCell>
                        <TableCell
                          className={cn(
                            'text-right tabular',
                            value < 0 && 'text-red-600',
                            line.strong && 'font-bold',
                          )}
                        >
                          {formatCurrency(value)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {dre.data?.previous && (
                <div className="mt-4 rounded-lg bg-slate-50 p-4 text-body-sm">
                  <p className="font-semibold text-navy-800">
                    Período anterior ({formatDate(dre.data!.previous!.from)} a {formatDate(dre.data!.previous!.to)}):
                  </p>
                  <p className="mt-1 tabular">
                    Receita líquida {formatCurrency(dre.data!.previous!.summary.receitaLiquida)} · Resultado{' '}
                    {formatCurrency(dre.data!.previous!.summary.resultadoLiquido)} · Margem{' '}
                    {dre.data!.previous!.summary.margemLiquida}%
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Grupos com contas */}
          <Card>
            <CardHeader>
              <CardTitle>Composição por conta</CardTitle>
              <CardDescription>Detalhamento das contas analíticas de resultado</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {dre.data?.groups.map((group) => (
                <div key={group.key} className="rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between border-b bg-slate-50/70 px-3 py-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-navy-800">
                      {group.label}
                    </span>
                    <span
                      className={cn(
                        'text-body-sm font-semibold tabular',
                        group.kind === 'despesa' && 'text-red-600',
                      )}
                    >
                      {formatCurrency(group.kind === 'despesa' ? -group.total : group.total)}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {group.accounts.length === 0 && (
                      <p className="px-3 py-2 text-body-sm text-slate-400">Sem movimentação.</p>
                    )}
                    {group.accounts.map((account) => (
                      <div key={account.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                        <span className="min-w-0 truncate text-body-sm">
                          <span className="text-slate-400">{account.code}</span> {account.name}
                        </span>
                        <span className="shrink-0 text-body-sm tabular">
                          {formatCurrency(group.kind === 'despesa' ? -account.amount : account.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Encerramento */}
              <div className="mt-2 rounded-lg border border-navy-200 bg-navy-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-navy-900">Encerramento do exercício</p>
                    <p className="text-body-sm text-slate-500">
                      {openPeriod
                        ? `Período aberto: ${openPeriod.name} (${STATUS_LABELS[openPeriod.status]})`
                        : 'Nenhum período aberto.'}
                    </p>
                  </div>
                  {openPeriod && canWrite && (
                    <Button size="sm" onClick={() => setClosingOpen(true)}>
                      <LockOpen className="h-4 w-4" />
                      Encerrar
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Diálogo de encerramento */}
      <Dialog open={closingOpen} onOpenChange={setClosingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encerrar período {openPeriod?.name}</DialogTitle>
            <DialogDescription>
              As contas de resultado serão zeradas e o resultado transferido ao Patrimônio Líquido.
              Os lançamentos de encerramento ficam permanentes no Livro Diário.
            </DialogDescription>
          </DialogHeader>

          {preview.isLoading ? (
            <p className="py-8 text-center text-slate-400">Calculando prévia…</p>
          ) : preview.data ? (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Lançamento de encerramento</p>
                  <p className="font-bold tabular">{formatCurrency(preview.data.closing.totalDebit)}</p>
                  <p className="text-xs text-slate-400">{preview.data.closing.lines.length} conta(s)</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Transferência ao PL</p>
                  <p className="font-bold tabular">{formatCurrency(preview.data.transfer.total)}</p>
                </div>
                <div className="rounded-lg bg-navy-50 p-3">
                  <p className="text-xs text-slate-500">Resultado</p>
                  <p
                    className={cn(
                      'font-bold tabular',
                      preview.data.result >= 0 ? 'text-emerald-700' : 'text-red-600',
                    )}
                  >
                    {formatCurrency(preview.data.result)}
                  </p>
                </div>
              </div>
              <Field label="Data do encerramento" hint="Padrão: último dia do período.">
                <Input type="date" value={closingDate} onChange={(event) => setClosingDate(event.target.value)} />
              </Field>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setClosingOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={executeClosing} disabled={closing || preview.isLoading}>
              <Lock className="h-4 w-4" />
              {closing ? 'Encerrando…' : 'Confirmar encerramento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
