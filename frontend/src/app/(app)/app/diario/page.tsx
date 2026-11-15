'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown, FileSpreadsheet, Plus, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, downloadFile } from '@/lib/api';
import { formatCurrency, formatDate, SOURCE_LABELS, todayISO } from '@/lib/format';
import type { Account, JournalEntry, Paginated } from '@/lib/types';
import { useAuth } from '@/components/providers/auth-provider';
import { EmptyCompany } from '@/components/empty-company';
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
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface DraftLine {
  accountId: string;
  debit: string;
  credit: string;
}

export default function DiarioPage() {
  const { company, user } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = company?.canWrite !== false && user?.role !== 'PROFESSOR';

  const [page, setPage] = React.useState(1);
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [accountId, setAccountId] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [reverseEntry, setReverseEntry] = React.useState<JournalEntry | null>(null);
  const [reverseReason, setReverseReason] = React.useState('');

  // Formulário de lançamento
  const [date, setDate] = React.useState(todayISO());
  const [history, setHistory] = React.useState('');
  const [lines, setLines] = React.useState<DraftLine[]>([
    { accountId: '', debit: '', credit: '' },
    { accountId: '', debit: '', credit: '' },
  ]);
  const [saving, setSaving] = React.useState(false);

  const accounts = useQuery({
    enabled: Boolean(company),
    queryKey: ['accounts', company?.id],
    queryFn: async () => {
      const { data } = await api.get<Account[]>('/accounts/options');
      return data;
    },
  });

  const entries = useQuery({
    enabled: Boolean(company),
    queryKey: ['journal', company?.id, page, from, to, accountId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<JournalEntry>>('/journal', {
        params: { page, pageSize: 15, from: from || undefined, to: to || undefined, accountId: accountId || undefined },
      });
      return data;
    },
  });

  const totalDebit = lines.reduce((acc, line) => acc + (Number(line.debit) || 0), 0);
  const totalCredit = lines.reduce((acc, line) => acc + (Number(line.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0;
  const allLinesValid = lines.every(
    (line) => line.accountId && (Number(line.debit) > 0 || Number(line.credit) > 0) &&
      !(Number(line.debit) > 0 && Number(line.credit) > 0),
  );

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function resetForm() {
    setDate(todayISO());
    setHistory('');
    setLines([
      { accountId: '', debit: '', credit: '' },
      { accountId: '', debit: '', credit: '' },
    ]);
  }

  async function submitEntry() {
    if (!balanced) {
      toast.error('Débitos e créditos devem ser iguais (partidas dobradas).');
      return;
    }
    if (!allLinesValid) {
      toast.error('Preencha todas as linhas: conta e um único valor (débito OU crédito).');
      return;
    }
    setSaving(true);
    try {
      await api.post('/journal', {
        date,
        history,
        lines: lines.map((line) => ({
          accountId: line.accountId,
          debit: Number(line.debit) || 0,
          credit: Number(line.credit) || 0,
        })),
      });
      toast.success('Lançamento registrado!');
      setOpen(false);
      resetForm();
      void entries.refetch();
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (error: any) {
      toast.error(error?.message ?? 'Falha ao registrar lançamento.');
    } finally {
      setSaving(false);
    }
  }

  async function submitReverse() {
    if (!reverseEntry) return;
    if (reverseReason.trim().length < 5) {
      toast.error('Descreva o motivo do estorno (mínimo 5 caracteres).');
      return;
    }
    try {
      await api.post(`/journal/${reverseEntry.id}/reverse`, { reason: reverseReason });
      toast.success('Estorno registrado!');
      setReverseEntry(null);
      setReverseReason('');
      void entries.refetch();
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (error: any) {
      toast.error(error?.message ?? 'Falha ao estornar.');
    }
  }

  async function exportReport(format: 'xlsx' | 'pdf') {
    try {
      await downloadFile(
        '/export/journal',
        { format, from: from || undefined, to: to || undefined, accountId: accountId || undefined },
        `diario.${format}`,
      );
    } catch {
      toast.error('Falha na exportação.');
    }
  }

  if (!company) {
    return <EmptyCompany />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 font-display text-navy-900">Livro Diário</h1>
          <p className="text-body-sm text-slate-500">
            Escrituração por partidas dobradas — lançamentos não podem ser excluídos, apenas estornados.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportReport('xlsx')}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportReport('pdf')}>
            <FileDown className="h-4 w-4" /> PDF
          </Button>
          {canWrite && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Novo lançamento
            </Button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <Field label="De" className="w-40">
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label="Até" className="w-40">
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
          <Field label="Conta" className="min-w-64 flex-1">
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Todas as contas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">Todas as contas</SelectItem>
                {(accounts.data ?? []).map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.code} — {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFrom('');
              setTo('');
              setAccountId('');
            }}
          >
            Limpar
          </Button>
        </CardContent>
      </Card>

      {/* Lista */}
      {entries.isLoading ? (
        <p className="py-16 text-center text-slate-400">Carregando lançamentos…</p>
      ) : !entries.data || entries.data.items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="font-semibold text-navy-900">Nenhum lançamento encontrado</p>
            <p className="text-body-sm text-slate-500">
              Registre lançamentos manuais ou movimente estoque/ativos para gerar entradas automáticas.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {entries.data.items.map((entry) => (
            <Card key={entry.id}>
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-2">
                <div>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    Nº {entry.number}
                    <Badge variant="outline">{SOURCE_LABELS[entry.source] ?? entry.source}</Badge>
                    {entry.reversalOf && (
                      <Badge variant="warning">Estorno do nº {entry.reversalOf.number}</Badge>
                    )}
                    {entry.reversedBy && (
                      <Badge variant="danger">Estornado pelo nº {entry.reversedBy.number}</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {formatDate(entry.date)} — {entry.history}
                    {entry.createdBy?.name ? ` · por ${entry.createdBy.name}` : ''}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-body-sm font-semibold tabular">
                    {formatCurrency(entry.totalDebit)}
                  </span>
                  {canWrite && !entry.reversedBy && entry.source !== 'ENCERRAMENTO' && (
                    <Button variant="ghost" size="icon" onClick={() => setReverseEntry(entry)} title="Estornar">
                      <Undo2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/60">
                      <TableHead className="w-32">Código</TableHead>
                      <TableHead>Conta</TableHead>
                      <TableHead className="w-36 text-right">Débito</TableHead>
                      <TableHead className="w-36 text-right">Crédito</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entry.lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="text-slate-500">{line.account.code}</TableCell>
                        <TableCell className="font-medium">{line.account.name}</TableCell>
                        <TableCell className={cn('text-right tabular', !Number(line.debit) && 'text-slate-300')}>
                          {Number(line.debit) ? formatCurrency(line.debit) : '—'}
                        </TableCell>
                        <TableCell className={cn('text-right tabular', !Number(line.credit) && 'text-slate-300')}>
                          {Number(line.credit) ? formatCurrency(line.credit) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}

          <div className="flex items-center justify-between">
            <span className="text-body-sm text-slate-500">
              {entries.data.total} lançamento(s) — página {entries.data.page} de {entries.data.totalPages}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= entries.data.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Diálogo de lançamento */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Novo lançamento contábil</DialogTitle>
            <DialogDescription>
              Débitos e créditos devem se equilibrar — a soma de cada lado precisa ser igual.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <Field label="Data" required>
                <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </Field>
              <Field label="Histórico" required>
                <Input
                  value={history}
                  onChange={(event) => setHistory(event.target.value)}
                  placeholder="Ex.: Pagamento de aluguel referente a…"
                />
              </Field>
            </div>

            <div className="rounded-lg border border-slate-200">
              <div className="grid grid-cols-[1fr_130px_130px] gap-2 border-b bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span>Conta</span>
                <span className="text-right">Débito</span>
                <span className="text-right">Crédito</span>
              </div>
              {lines.map((line, index) => (
                <div key={index} className="grid grid-cols-[1fr_130px_130px] items-center gap-2 border-b border-slate-100 px-3 py-2">
                  <Select
                    value={line.accountId}
                    onValueChange={(value) => updateLine(index, { accountId: value })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Selecione…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(accounts.data ?? []).map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.code} — {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="h-8 text-right"
                    value={line.debit}
                    onChange={(event) => updateLine(index, { debit: event.target.value, credit: '' })}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="h-8 text-right"
                    value={line.credit}
                    onChange={(event) => updateLine(index, { credit: event.target.value, debit: '' })}
                  />
                </div>
              ))}
              <div className="flex items-center justify-between px-3 py-2">
                <Button variant="ghost" size="sm" onClick={() => setLines((prev) => [...prev, { accountId: '', debit: '', credit: '' }])}>
                  <Plus className="h-3.5 w-3.5" /> Linha
                </Button>
                <div className="flex gap-6 pr-2 text-body-sm font-semibold tabular">
                  <span className={cn(totalDebit === totalCredit ? 'text-emerald-700' : 'text-red-600')}>
                    D {formatCurrency(totalDebit, '')}
                  </span>
                  <span className={cn(totalDebit === totalCredit ? 'text-emerald-700' : 'text-red-600')}>
                    C {formatCurrency(totalCredit, '')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitEntry} disabled={saving || !balanced || !allLinesValid}>
              {saving ? 'Registrando…' : balanced ? 'Registrar lançamento' : 'Desequilibrado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de estorno */}
      <Dialog open={Boolean(reverseEntry)} onOpenChange={(value) => !value && setReverseEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Estornar lançamento nº {reverseEntry?.number}</DialogTitle>
            <DialogDescription>
              Será criado um lançamento espelho com débitos e créditos invertidos.
            </DialogDescription>
          </DialogHeader>
          <Field label="Motivo do estorno" required>
            <Textarea
              value={reverseReason}
              onChange={(event) => setReverseReason(event.target.value)}
              placeholder="Ex.: Valor lançado incorretamente, refazer o lançamento."
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseEntry(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={submitReverse}>
              Confirmar estorno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
