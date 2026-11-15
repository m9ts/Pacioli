'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, FileSpreadsheet, CheckCircle2, XCircle } from 'lucide-react';
import { api, downloadFile } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useAuth } from '@/components/providers/auth-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { EmptyCompany } from '@/components/empty-company';

interface TrialBalanceRow {
  id: string;
  code: string;
  name: string;
  openingDebit: number;
  openingCredit: number;
  movementDebit: number;
  movementCredit: number;
  closingDebit: number;
  closingCredit: number;
}

export default function BalancetePage() {
  const { company } = useAuth();
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');

  const report = useQuery({
    enabled: Boolean(company),
    queryKey: ['trial-balance', company?.id, from, to],
    queryFn: async () => {
      const { data } = await api.get('/reports/trial-balance', {
        params: { from: from || undefined, to: to || undefined },
      });
      return data as {
        rows: TrialBalanceRow[];
        totals: {
          openingDebit: number;
          openingCredit: number;
          movementDebit: number;
          movementCredit: number;
          closingDebit: number;
          closingCredit: number;
        };
        balanced: boolean;
        difference: number;
      };
    },
  });

  async function exportReport(format: 'xlsx' | 'pdf') {
    try {
      await downloadFile(
        '/export/trial-balance',
        { format, from: from || undefined, to: to || undefined },
        `balancete.${format}`,
      );
    } catch {}
  }

  if (!company) return <EmptyCompany />;

  const rows = report.data?.rows ?? [];
  const totals = report.data?.totals;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 font-display text-navy-900">Balancete de Verificação</h1>
          <p className="text-body-sm text-slate-500">
            Saldos anteriores, movimento do período e saldos finais por conta analítica.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportReport('xlsx')}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportReport('pdf')}>
            <FileDown className="h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <Field label="De" className="w-40">
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label="Até" className="w-40">
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
        </CardContent>
      </Card>

      {report.isLoading ? (
        <p className="py-16 text-center text-slate-400">Calculando balancete…</p>
      ) : (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Contas movimentadas e com saldo</CardTitle>
              <CardDescription>
                O total de débitos deve ser igual ao total de créditos (partidas dobradas).
              </CardDescription>
            </div>
            {report.data && (
              <Badge variant={report.data.balanced ? 'success' : 'danger'} className="shrink-0">
                {report.data.balanced ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                {report.data.balanced ? 'Equilibrado' : `Divergência ${formatCurrency(report.data.difference)}`}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/60">
                  <TableHead className="w-24">Código</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead className="text-right">S. anterior D</TableHead>
                  <TableHead className="text-right">S. anterior C</TableHead>
                  <TableHead className="text-right">Débitos</TableHead>
                  <TableHead className="text-right">Créditos</TableHead>
                  <TableHead className="text-right">S. final D</TableHead>
                  <TableHead className="text-right">S. final C</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-slate-400">
                      Nenhuma conta movimentada no período.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-slate-500">{row.code}</TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className={cn('text-right tabular', !row.openingDebit && 'text-slate-300')}>
                      {row.openingDebit ? formatCurrency(row.openingDebit) : '—'}
                    </TableCell>
                    <TableCell className={cn('text-right tabular', !row.openingCredit && 'text-slate-300')}>
                      {row.openingCredit ? formatCurrency(row.openingCredit) : '—'}
                    </TableCell>
                    <TableCell className={cn('text-right tabular', !row.movementDebit && 'text-slate-300')}>
                      {row.movementDebit ? formatCurrency(row.movementDebit) : '—'}
                    </TableCell>
                    <TableCell className={cn('text-right tabular', !row.movementCredit && 'text-slate-300')}>
                      {row.movementCredit ? formatCurrency(row.movementCredit) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular">
                      {row.closingDebit ? formatCurrency(row.closingDebit) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular">
                      {row.closingCredit ? formatCurrency(row.closingCredit) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {totals && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} className="font-bold">TOTAIS</TableCell>
                    <TableCell className="text-right tabular font-bold">{formatCurrency(totals.openingDebit)}</TableCell>
                    <TableCell className="text-right tabular font-bold">{formatCurrency(totals.openingCredit)}</TableCell>
                    <TableCell className="text-right tabular font-bold">{formatCurrency(totals.movementDebit)}</TableCell>
                    <TableCell className="text-right tabular font-bold">{formatCurrency(totals.movementCredit)}</TableCell>
                    <TableCell className="text-right tabular font-bold">{formatCurrency(totals.closingDebit)}</TableCell>
                    <TableCell className="text-right tabular font-bold">{formatCurrency(totals.closingCredit)}</TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
