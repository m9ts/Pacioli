'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api, downloadFile } from '@/lib/api';
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
import { SEGMENT_LABELS, todayISO } from '@/lib/format';

export default function ImportSpreadsheetPage() {
  const router = useRouter();
  const { refresh, selectCompany, user } = useAuth();
  const [saving, setSaving] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [form, setForm] = React.useState({
    name: '',
    segment: 'COMERCIO',
    openingDate: todayISO(),
    initialCapital: '10000',
  });

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      toast.error('Selecione a planilha (.xlsx ou .csv).');
      return;
    }
    if (!form.name.trim()) {
      toast.error('Informe o nome da empresa.');
      return;
    }
    setSaving(true);
    try {
      const name = form.name.trim();
      const payload = {
        legalName: name,
        tradeName: name,
        segment: form.segment,
        openingDate: form.openingDate,
        responsibleName: user?.name || 'Responsável',
        initialCapital: Number(form.initialCapital) || 0,
      };
      const data = new FormData();
      data.append('file', file);
      data.append('payload', JSON.stringify(payload));

      const { data: result } = await api.post<{ companyId: string; itemsImported: number }>(
        '/companies/import',
        data,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );

      await refresh();
      selectCompany(result.companyId);
      toast.success(
        `Planilha importada: ${result.itemsImported} itens registrados na abertura da empresa.`,
      );
      router.push('/app/dashboard');
      router.refresh();
    } catch (error: any) {
      const data = error?.response?.data;
      const payload = data?.message;
      if (payload && typeof payload === 'object') {
        toast.error(payload.message ?? 'A planilha contém problemas.');
        if (Array.isArray(payload.errors)) {
          payload.errors.slice(0, 4).forEach((item: string) => toast.error(item));
        }
      } else {
        toast.error(payload ?? error?.message ?? 'Falha ao importar a planilha.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-h1 font-display text-navy-900">Importar planilha de abertura</h1>
        <p className="text-body text-slate-500">
          Envie um arquivo .xlsx ou .csv com as colunas <strong>Tipo</strong>, <strong>Conta</strong>,{' '}
          <strong>Descrição</strong> e <strong>Valor</strong> — a empresa é criada e a abertura é
          lançada automaticamente.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-h2 font-display text-navy-900">Dados da empresa</CardTitle>
          <CardDescription>
            Informações básicas do cadastro; o período contábil é criado no ano da abertura.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome da empresa" required className="sm:col-span-2">
              <Input
                value={form.name}
                onChange={(event) => update('name', event.target.value)}
                placeholder="Padaria Exemplo"
                required
                autoFocus
              />
            </Field>
            <Field label="Segmento">
              <Select value={form.segment} onValueChange={(value) => update('segment', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SEGMENT_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Data de abertura" required>
              <Input
                type="date"
                value={form.openingDate}
                onChange={(event) => update('openingDate', event.target.value)}
                required
              />
            </Field>
            <Field
              label="Capital inicial"
              required
              hint="Integralizado em dinheiro na abertura."
              className="sm:col-span-2"
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.initialCapital}
                onChange={(event) => update('initialCapital', event.target.value)}
                required
              />
            </Field>

            <Field
              label="Planilha de patrimônio inicial"
              required
              className="sm:col-span-2"
              hint="Modelo: Tipo (BEM, DIREITO ou OBRIGACAO) · Conta (código) · Descrição · Valor."
            >
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-navy-300 bg-white px-4 py-3 text-body-sm transition-colors hover:border-gold-400 hover:bg-gold-50">
                <Upload className="h-4 w-4 text-navy-600" />
                <span className="min-w-0 flex-1 truncate text-navy-700">
                  {file ? file.name : 'Clique para escolher o arquivo .xlsx ou .csv'}
                </span>
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  className="sr-only"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </label>
            </Field>

            <div className="flex items-center justify-between gap-3 sm:col-span-2">
              <Link
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  void downloadTemplate();
                }}
                className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-navy-600 hover:text-navy-800 hover:underline"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Baixar planilha modelo
              </Link>
              <Button type="submit" disabled={saving}>
                <Upload className="h-4 w-4" />
                {saving ? 'Importando…' : 'Importar e concluir abertura'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );

  async function downloadTemplate() {
    const rows = [
      'Tipo;Conta;Descrição;Valor',
      'BEM;1.1.1.01;Dinheiro em caixa;1500,00',
      'BEM;1.1.3.01;Estoque inicial;2000,00',
      'DIREITO;1.1.2.01;Duplicatas a receber;500,00',
      'OBRIGACAO;2.1.1.01;Fornecedores;300,00',
    ].join('\n');
    const blob = new Blob([`\uFEFF${rows}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo-abertura.csv';
    link.click();
    URL.revokeObjectURL(url);
  }
}
