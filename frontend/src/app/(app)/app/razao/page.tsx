'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, FileSpreadsheet, ScrollText } from 'lucide-react';
import { api, downloadFile } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Account, Paginated } from '@/lib/types';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

export default function RazaoPage() {
  const { company } = useAuth();
  const [accountId, setAccountId] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');

  const accounts = useQuery({
    enabled: Boolean(company),
    queryKey: ['accounts', company?.id],
    queryFn: async () => {
      const { data } = await api.get<Account[]>('/accounts/options');
      return data;
    },
  });

  const ledger = useQuery({
    enabled: Boolean(company) && Boolean(accountId),
    queryKey: ['ledger', company?.id, accountId, from, to],
    queryFn: async () => {
      const { data } = await api.get('/reports/ledger', {
        params: { accountId, from: from || undefined, to: to || undefined },
      });
      return data as {
        account: Account;
        openingBalance: number;
        lines: { date: string; entryNumber: number; history: string; debit: number; credit: number; balance: number }[];
        totalDebit: number;
        totalCredit: number;
        closingBalance: number;
        nature: string;
      };
    },
  });

  async function exportReport(format: 'xlsx' | 'pdf') {
    try {
      await downloadFile(
        '/export/ledger',
        { format, accountId, from: from || undefined, to: to || undefined },
        `razao.${format}`,
      );
    } catch {}
  }

  if (!company) return <EmptyCompany />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 font-display text-navy-900">Livro Razão</h1>
          <p className="text-body-sm text-slate-500">
            Movimentação e saldo acumulado de cada conta, em ordem cronológica.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!accountId}
            onClick={() => exportReport('xlsx')}
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" disabled={!accountId} onClick={() => exportReport('pdf')}>
            <FileDown className="h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <Field label="Conta contábil" className="min-w-72 flex-1" required>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a conta…" />
              </SelectTrigger>
              <SelectContent>
                {(accounts.data ?? []).map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.code} — {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="De" className="w-40">
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label="Até" className="w-40">
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
        </CardContent>
      </Card>

      {!accountId ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ScrollText className="h-10 w-10 text-slate-300" />
            <p className="font-semibold text-navy-900">Selecione uma conta</p>
            <p className="text-body-sm text-slate-500">
              O razão mostra todas as partidas que movimentaram a conta escolhida.
            </p>
          </CardContent>
        </Card>
      ) : ledger.isLoading ? (
        <p className="py-16 text-center text-slate-400">Carregando razão…</p>
      ) : ledger.data ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {ledger.data.account.code} — {ledger.data.account.name}
            </CardTitle>
            <CardDescription>
              Natureza {ledger.data.nature.toLowerCase()} · saldo inicial {formatCurrency(ledger.data.openingBalance)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/60">
                  <TableHead className="w-28">Data</TableHead>
                  <TableHead className="w-20">Nº</TableHead>
                  <TableHead>Histórico</TableHead>
                  <TableHead className="w-32 text-right">Débito</TableHead>
                  <TableHead className="w-32 text-right">Crédito</TableHead>
                  <TableHead className="w-36 text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.data.lines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-slate-400">
                      Nenhuma movimentação no período.
                    </TableCell>
                  </TableRow>
                )}
                {ledger.data.lines.map((line, index) => (
                  <TableRow key={index}>
                    <TableCell>{formatDate(line.date)}</TableCell>
                    <TableCell>#{line.entryNumber}</TableCell>
                    <TableCell className="max-w-md truncate">{line.history}</TableCell>
                    <TableCell className="text-right tabular">
                      {line.debit ? formatCurrency(line.debit) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {line.credit ? formatCurrency(line.credit) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular">
                      {formatCurrency(line.balance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-3 flex flex-wrap items-center justify-end gap-6 rounded-lg bg-slate-50 px-4 py-3 text-body-sm font-semibold">
              <span className="tabular">Débitos: {formatCurrency(ledger.data.totalDebit)}</span>
              <span className="tabular">Créditos: {formatCurrency(ledger.data.totalCredit)}</span>
              <span className="text-navy-900 tabular">
                Saldo final: {formatCurrency(ledger.data.closingBalance)}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
