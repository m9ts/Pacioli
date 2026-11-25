'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, FileDown, FileSpreadsheet, Plus, TruckIcon, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, downloadFile } from '@/lib/api';
import { formatCurrency, formatDate, toISODateInput, todayISO } from '@/lib/format';
import type { Asset } from '@/lib/types';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyCompany } from '@/components/empty-company';

const CATEGORIES = [
  { value: 'MOVEIS_UTENSILIOS', label: 'Móveis e Utensílios' },
  { value: 'MAQUINAS_EQUIPAMENTOS', label: 'Máquinas e Equipamentos' },
  { value: 'VEICULOS', label: 'Veículos' },
  { value: 'INFORMATICA', label: 'Equipamentos de Informática' },
  { value: 'IMOVEIS', label: 'Imóveis' },
  { value: 'OUTROS', label: 'Outros Bens' },
];

interface AssetForm {
  code: string;
  name: string;
  category: string;
  acquisitionDate: string;
  acquisitionValue: string;
  usefulLifeMonths: string;
  residualValue: string;
  acquisitionMethod: string;
  paymentMethod: string;
  location: string;
  supplierName: string;
  description: string;
}

interface DepreciationRow {
  assetId: string;
  code: string;
  name: string;
  alreadyPosted: boolean;
  eligible: boolean;
  amount: number;
  remaining: number;
}

export default function AtivosPage() {
  const { company, user } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = company?.canWrite !== false && user?.role !== 'PROFESSOR';

  const [acquireOpen, setAcquireOpen] = React.useState(false);
  const [depOpen, setDepOpen] = React.useState(false);
  const [disposalTarget, setDisposalTarget] = React.useState<any | null>(null);
  const [saving, setSaving] = React.useState(false);

  const [assetForm, setAssetForm] = React.useState<AssetForm>({
    code: '',
    name: '',
    category: 'MOVEIS_UTENSILIOS',
    acquisitionDate: todayISO(),
    acquisitionValue: '',
    usefulLifeMonths: '48',
    residualValue: '0',
    acquisitionMethod: 'A_VISTA',
    paymentMethod: 'DINHEIRO',
    location: '',
    supplierName: '',
    description: '',
  });

  const [depMonth, setDepMonth] = React.useState(() => {
    const now = new Date();
    return { year: String(now.getUTCFullYear()), month: String(now.getUTCMonth() + 1).padStart(2, '0') };
  });

  const [disposal, setDisposal] = React.useState({
    date: todayISO(),
    value: '0',
    paymentMethod: 'DINHEIRO',
    description: '',
  });

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

  const depPreview = useQuery({
    enabled: Boolean(company) && depOpen,
    queryKey: ['dep-preview', company?.id, depMonth.year, depMonth.month],
    queryFn: async () => {
      const { data } = await api.get<{ rows: DepreciationRow[]; total: number; eligibleCount: number }>(
        '/assets/depreciation/preview',
        { params: { year: Number(depMonth.year), month: Number(depMonth.month) } },
      );
      return data;
    },
  });

  async function submitAsset() {
    const form = assetForm;
    if (!form.code.trim() || !form.name.trim() || Number(form.acquisitionValue) <= 0) {
      toast.error('Preencha código, nome e valor de aquisição.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/assets', {
        code: form.code.trim(),
        name: form.name.trim(),
        category: form.category,
        acquisitionDate: form.acquisitionDate,
        acquisitionValue: Number(form.acquisitionValue),
        usefulLifeMonths: Number(form.usefulLifeMonths) || 48,
        residualValue: Number(form.residualValue) || 0,
        acquisitionMethod: form.acquisitionMethod,
        paymentMethod: form.paymentMethod,
        ...(form.location ? { location: form.location } : {}),
        ...(form.supplierName ? { supplierName: form.supplierName } : {}),
        ...(form.description ? { description: form.description } : {}),
      });
      toast.success('Ativo adquirido e contabilizado!');
      setAcquireOpen(false);
      void queryClient.invalidateQueries();
    } catch (error: any) {
      toast.error(error?.message ?? 'Falha na aquisição.');
    } finally {
      setSaving(false);
    }
  }

  async function submitDepreciation() {
    setSaving(true);
    try {
      const { data } = await api.post('/assets/depreciation', {
        year: Number(depMonth.year),
        month: Number(depMonth.month),
      });
      toast.success(data.message ?? 'Depreciação contabilizada.');
      setDepOpen(false);
      void queryClient.invalidateQueries();
    } catch (error: any) {
      toast.error(error?.message ?? 'Falha na depreciação.');
    } finally {
      setSaving(false);
    }
  }

  async function submitDisposal() {
    if (!disposalTarget) return;
    setSaving(true);
    try {
      await api.post(`/assets/${disposalTarget.id}/disposal`, {
        date: disposal.date,
        value: Number(disposal.value) || 0,
        paymentMethod: disposal.paymentMethod,
        ...(disposal.description ? { description: disposal.description } : {}),
      });
      toast.success('Ativo baixado e contabilizado.');
      setDisposalTarget(null);
      void queryClient.invalidateQueries();
    } catch (error: any) {
      toast.error(error?.message ?? 'Falha na baixa.');
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 font-display text-navy-900">Ativos</h1>
          <p className="text-body-sm text-slate-500">
            Imobilizado da empresa: aquisição, transferência e baixa, sempre contabilizadas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/app/depreciacao">
              <CalendarClock className="h-4 w-4" /> Depreciação
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportReport('xlsx')}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportReport('pdf')}>
            <FileDown className="h-4 w-4" /> PDF
          </Button>
          {canWrite && (
            <>
              <Button variant="gold" size="sm" onClick={() => setDepOpen(true)}>
                <CalendarClock className="h-4 w-4" /> Depreciar mês
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  setAssetForm((prev) => ({
                    ...prev,
                    code: '',
                    name: '',
                    acquisitionValue: '',
                  }))
                }
              >
                <Plus className="h-4 w-4" /> Novo ativo
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-body-sm text-slate-500">Ativos</p>
            <p className="text-h2 font-display text-navy-900">{totals?.count ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-body-sm text-slate-500">Custo de aquisição</p>
            <p className="text-h2 font-display text-navy-900 tabular">{formatCurrency(totals?.cost ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-body-sm text-slate-500">Depreciação acumulada</p>
            <p className="text-h2 font-display text-amber-600 tabular">
              {formatCurrency(totals?.accumulatedDepreciation ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-body-sm text-slate-500">Valor líquido contábil</p>
            <p className="text-h2 font-display text-emerald-700 tabular">
              {formatCurrency(totals?.bookValue ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Imobilizado</CardTitle>
          <CardDescription>
            Cada aquisição, depreciação e baixa gera lançamentos no Livro Diário automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/60">
                <TableHead className="w-24">Código</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="w-28">Aquisição</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Deprec. acum.</TableHead>
                <TableHead className="text-right">Líquido</TableHead>
                <TableHead className="text-right">Mensal</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.isLoading && (
                <TableRow>
                  <TableCell colSpan={10} className="py-12 text-center text-slate-400">
                    Carregando ativos…
                  </TableCell>
                </TableRow>
              )}
              {assets.data?.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-12 text-center text-slate-400">
                    Nenhum ativo registrado.
                  </TableCell>
                </TableRow>
              )}
              {assets.data?.rows.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell className="text-slate-500">{asset.code}</TableCell>
                  <TableCell>
                    <span className="font-medium">{asset.name}</span>
                    {asset.location && <span className="block text-xs text-slate-400">{asset.location}</span>}
                  </TableCell>
                  <TableCell className="text-body-sm">{asset.categoryLabel}</TableCell>
                  <TableCell>{formatDate(asset.acquisitionDate)}</TableCell>
                  <TableCell className="text-right tabular">{formatCurrency(asset.acquisitionValue)}</TableCell>
                  <TableCell className="text-right tabular text-amber-700">
                    {formatCurrency(asset.accumulatedDepreciation)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular">
                    {formatCurrency(asset.bookValue)}
                  </TableCell>
                  <TableCell className="text-right tabular text-slate-500">
                    {formatCurrency(asset.monthlyDepreciation)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        asset.status === 'ATIVO' ? 'success' : asset.status === 'BAIXADO' ? 'danger' : 'warning'
                      }
                    >
                      {asset.status === 'ATIVO' ? 'Ativo' : asset.status === 'BAIXADO' ? 'Baixado' : 'Transferido'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {canWrite && asset.status !== 'BAIXADO' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Dar baixa"
                        onClick={() => {
                          setDisposal({ date: todayISO(), value: '0', paymentMethod: 'DINHEIRO', description: '' });
                          setDisposalTarget(asset);
                        }}
                      >
                        <TruckIcon className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Diálogo de aquisição */}
      <Dialog open={acquireOpen} onOpenChange={setAcquireOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Aquisição de ativo</DialogTitle>
            <DialogDescription>
              O lançamento de compra do imobilizado é gerado automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Código" required>
              <Input
                value={assetForm.code}
                onChange={(event) => setAssetForm((prev) => ({ ...prev, code: event.target.value }))}
                placeholder="ATV-004"
              />
            </Field>
            <Field label="Nome" required>
              <Input
                value={assetForm.name}
                onChange={(event) => setAssetForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Freezer vertical"
              />
            </Field>
            <Field label="Categoria" required>
              <Select
                value={assetForm.category}
                onValueChange={(value) => setAssetForm((prev) => ({ ...prev, category: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Data de aquisição" required>
              <Input
                type="date"
                value={assetForm.acquisitionDate}
                onChange={(event) => setAssetForm((prev) => ({ ...prev, acquisitionDate: event.target.value }))}
              />
            </Field>
            <Field label="Valor de aquisição" required>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={assetForm.acquisitionValue}
                onChange={(event) => setAssetForm((prev) => ({ ...prev, acquisitionValue: event.target.value }))}
                placeholder="0,00"
              />
            </Field>
            <Field label="Vida útil (meses)" required>
              <Input
                type="number"
                min="1"
                value={assetForm.usefulLifeMonths}
                onChange={(event) => setAssetForm((prev) => ({ ...prev, usefulLifeMonths: event.target.value }))}
              />
            </Field>
            <Field label="Valor residual">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={assetForm.residualValue}
                onChange={(event) => setAssetForm((prev) => ({ ...prev, residualValue: event.target.value }))}
              />
            </Field>
            <Field label="Forma de aquisição" required>
              <Select
                value={assetForm.acquisitionMethod}
                onValueChange={(value) => setAssetForm((prev) => ({ ...prev, acquisitionMethod: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A_VISTA">À vista</SelectItem>
                  <SelectItem value="A_PRAZO">A prazo (fornecedores)</SelectItem>
                  <SelectItem value="FINANCIAMENTO">Financiamento</SelectItem>
                  <SelectItem value="INTEGRALIZACAO_CAPITAL">Integralização de capital</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {assetForm.acquisitionMethod === 'A_VISTA' && (
              <Field label="Pagamento">
                <Select
                  value={assetForm.paymentMethod}
                  onValueChange={(value) => setAssetForm((prev) => ({ ...prev, paymentMethod: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DINHEIRO">Dinheiro (Caixa)</SelectItem>
                    <SelectItem value="BANCO">Banco</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field label="Localização">
              <Input
                value={assetForm.location}
                onChange={(event) => setAssetForm((prev) => ({ ...prev, location: event.target.value }))}
                placeholder="Loja — Centro"
              />
            </Field>
            <Field label="Fornecedor">
              <Input
                value={assetForm.supplierName}
                onChange={(event) => setAssetForm((prev) => ({ ...prev, supplierName: event.target.value }))}
                placeholder="Nome do fornecedor"
              />
            </Field>
            <Field label="Descrição" className="sm:col-span-2">
              <Textarea
                value={assetForm.description}
                onChange={(event) => setAssetForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcquireOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitAsset} disabled={saving}>
              {saving ? 'Registrando…' : 'Adquirir e contabilizar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de depreciação */}
      <Dialog open={depOpen} onOpenChange={setDepOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Depreciação mensal</DialogTitle>
            <DialogDescription>
              Prévia dos ativos elegíveis para o mês selecionado.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3">
            <Field label="Ano" className="flex-1">
              <Input
                type="number"
                value={depMonth.year}
                onChange={(event) => setDepMonth((prev) => ({ ...prev, year: event.target.value }))}
              />
            </Field>
            <Field label="Mês" className="flex-1">
              <Select
                value={depMonth.month}
                onValueChange={(value) => setDepMonth((prev) => ({ ...prev, month: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                    <SelectItem key={month} value={String(month).padStart(2, '0')}>
                      {String(month).padStart(2, '0')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/60">
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Valor do mês</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(depPreview.data?.rows ?? []).map((row) => (
                  <TableRow key={row.assetId}>
                    <TableCell>
                      <span className="font-medium">{row.name}</span>
                      <span className="block text-xs text-slate-400">{row.code}</span>
                    </TableCell>
                    <TableCell className="text-right tabular">{formatCurrency(row.amount)}</TableCell>
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
                {depPreview.data?.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-slate-400">
                      Nenhum ativo ativo registrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-body-sm">
            Total a contabilizar:{' '}
            <strong className="tabular">{formatCurrency(depPreview.data?.total ?? 0)}</strong>
            {' · '}
            {depPreview.data?.eligibleCount ?? 0} ativo(s) elegível(is)
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitDepreciation} disabled={saving || (depPreview.data?.eligibleCount ?? 0) === 0}>
              <CalendarClock className="h-4 w-4" />
              {saving ? 'Contabilizando…' : 'Contabilizar depreciação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de baixa */}
      <Dialog open={Boolean(disposalTarget)} onOpenChange={(value) => !value && setDisposalTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Baixa do ativo: {disposalTarget?.name}</DialogTitle>
            <DialogDescription>
              A depreciação acumulada será eliminada e a venda/perda contabilizada.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Data da baixa" required>
              <Input
                type="date"
                value={disposal.date}
                onChange={(event) => setDisposal((prev) => ({ ...prev, date: event.target.value }))}
              />
            </Field>
            <Field label="Valor recebido" hint="0 para doação ou perda total.">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={disposal.value}
                onChange={(event) => setDisposal((prev) => ({ ...prev, value: event.target.value }))}
              />
            </Field>
            <Field label="Recebimento">
              <Select
                value={disposal.paymentMethod}
                onValueChange={(value) => setDisposal((prev) => ({ ...prev, paymentMethod: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DINHEIRO">Dinheiro (Caixa)</SelectItem>
                  <SelectItem value="BANCO">Banco</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Descrição" className="sm:col-span-2">
              <Input
                value={disposal.description}
                onChange={(event) => setDisposal((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Ex.: Venda de freezer ao concorrente"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisposalTarget(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={submitDisposal} disabled={saving}>
              {saving ? 'Baixando…' : 'Confirmar baixa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
