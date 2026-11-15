'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, FileSpreadsheet, CheckCircle2, XCircle } from 'lucide-react';
import { api, downloadFile } from '@/lib/api';
import { formatCurrency, todayISO } from '@/lib/format';
import { useAuth } from '@/components/providers/auth-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { EmptyCompany } from '@/components/empty-company';

interface SheetRow {
  id: string;
  code: string;
  name: string;
  amount: number;
}

interface BalanceSheet {
  date: string;
  ativo: {
    circulante: { rows: SheetRow[]; total: number };
    naoCirculante: { rows: SheetRow[]; total: number };
    total: number;
  };
  passivo: {
    circulante: { rows: SheetRow[]; total: number };
    naoCirculante: { rows: SheetRow[]; total: number };
    total: number;
  };
  patrimonioLiquido: {
    rows: SheetRow[];
    resultadoExercicio: number;
    total: number;
  };
  totalPassivoPl: number;
  balanced: boolean;
  difference: number;
}

function Group({
  title,
  data,
  strong,
}: {
  title: string;
  data?: { rows: SheetRow[]; total: number };
  strong?: boolean;
}) {
  if (!data) return null;
  return (
    <div className={cn('rounded-lg border', strong ? 'border-navy-200 bg-navy-50/50' : 'border-slate-200')}>
      <div className="border-b bg-slate-50/70 px-4 py-2 text-xs font-bold uppercase tracking-wide text-navy-800">
        {title}
      </div>
      <div className="divide-y divide-slate-50">
        {data.rows.length === 0 && (
          <p className="px-4 py-2 text-body-sm text-slate-400">Sem contas neste grupo.</p>
        )}
        {data.rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-2">
            <span className="min-w-0 truncate text-body-sm">
              <span className="text-slate-400">{row.code}</span> {row.name}
            </span>
            <span className="shrink-0 text-body-sm tabular">{formatCurrency(row.amount)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between bg-slate-50/70 px-4 py-2">
          <span className="text-body-sm font-bold">Total</span>
          <span className="text-body-sm font-bold tabular">{formatCurrency(data.total)}</span>
        </div>
      </div>
    </div>
  );
}

export default function BalancoPage() {
  const { company } = useAuth();
  const [date, setDate] = React.useState('');

  const report = useQuery({
    enabled: Boolean(company),
    queryKey: ['balance-sheet', company?.id, date],
    queryFn: async () => {
      const { data } = await api.get<BalanceSheet>('/reports/balance-sheet', {
        params: { date: date || undefined },
      });
      return data;
    },
  });

  async function exportReport(format: 'xlsx' | 'pdf') {
    try {
      await downloadFile('/export/balance-sheet', { format, date: date || undefined }, `balanco.${format}`);
    } catch {}
  }

  if (!company) return <EmptyCompany />;
  const data = report.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 font-display text-navy-900">Balanço Patrimonial</h1>
          <p className="text-body-sm text-slate-500">
            Ativo, Passivo e Patrimônio Líquido em {formatDateBR(data?.date ?? (date || todayISO()))}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Data-base" className="w-44">
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Button variant="outline" size="sm" onClick={() => exportReport('xlsx')}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportReport('pdf')}>
            <FileDown className="h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      {report.isLoading ? (
        <p className="py-16 text-center text-slate-400">Calculando balanço…</p>
      ) : !data ? (
        <Card>
          <CardContent className="py-16 text-center text-slate-400">
            Não foi possível calcular o balanço.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex justify-center">
            <Badge variant={data.balanced ? 'success' : 'danger'} className="px-3 py-1 text-sm">
              {data.balanced ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {data.balanced ? 'Balanço equilibrado (Ativo = Passivo + PL)' : `Divergência de ${formatCurrency(data.difference)}`}
            </Badge>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>ATIVO</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Group title="Ativo Circulante" data={data.ativo.circulante} />
                <Group title="Ativo Não Circulante" data={data.ativo.naoCirculante} />
                <div className="flex items-center justify-between rounded-lg bg-navy-900 px-4 py-3 text-white">
                  <span className="font-bold">TOTAL DO ATIVO</span>
                  <span className="text-body-lg font-bold tabular">{formatCurrency(data.ativo.total)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>PASSIVO E PATRIMÔNIO LÍQUIDO</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Group title="Passivo Circulante" data={data.passivo.circulante} />
                <Group title="Passivo Não Circulante" data={data.passivo.naoCirculante} />
                <Group title="Patrimônio Líquido" data={data.patrimonioLiquido} strong />
                <div className="flex items-center justify-between rounded-lg bg-navy-900 px-4 py-3 text-white">
                  <span className="font-bold">TOTAL DO PASSIVO + PL</span>
                  <span className="text-body-lg font-bold tabular">{formatCurrency(data.totalPassivoPl)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDateBR(iso: string) {
  if (!iso) return 'hoje';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
