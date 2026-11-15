'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FileDown, FileSpreadsheet, PackagePlus, Plus, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, downloadFile } from '@/lib/api';
import {
  formatCurrency,
  formatDate,
  MOVEMENT_LABELS,
  PAYMENT_LABELS,
  STATUS_LABELS,
  todayISO,
} from '@/lib/format';
import type { Account, Paginated, Product, StockMovement } from '@/lib/types';
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

interface ProductForm {
  id?: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  minimumStock: string;
  salePrice: string;
  inventoryAccountId: string;
  revenueAccountId: string;
  cmvAccountId: string;
}
interface MovementForm {
  productId: string;
  type: string;
  date: string;
  quantity: string;
  unitValue: string;
  paymentMethod: string;
  documentNumber: string;
  description: string;
  customerId: string;
  supplierId: string;
}

const OUT_TYPES = new Set(['VENDA', 'SAIDA', 'DEVOLUCAO_COMPRA']);

export default function EstoquePage() {
  const { company, user } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = company?.canWrite !== false && user?.role !== 'PROFESSOR';

  const [productOpen, setProductOpen] = React.useState(false);
  const [movementOpen, setMovementOpen] = React.useState(false);
  const [reverseTarget, setReverseTarget] = React.useState<StockMovement | null>(null);
  const [reverseReason, setReverseReason] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const emptyProduct: ProductForm = {
    code: '',
    name: '',
    category: '',
    unit: 'UN',
    minimumStock: '0',
    salePrice: '0',
    inventoryAccountId: '',
    revenueAccountId: '',
    cmvAccountId: '',
  };
  const emptyMovement: MovementForm = {
    productId: '',
    type: 'COMPRA',
    date: todayISO(),
    quantity: '',
    unitValue: '',
    paymentMethod: 'DINHEIRO',
    documentNumber: '',
    description: '',
    customerId: '',
    supplierId: '',
  };
  const [productForm, setProductForm] = React.useState<ProductForm>(emptyProduct);
  const [movementForm, setMovementForm] = React.useState<MovementForm>(emptyMovement);

  const accounts = useQuery({
    enabled: Boolean(company),
    queryKey: ['accounts-options', company?.id],
    queryFn: async () => {
      const { data } = await api.get<Account[]>('/accounts/options');
      return data;
    },
  });

  const products = useQuery({
    enabled: Boolean(company),
    queryKey: ['products', company?.id],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Product> & { categories: string[] }>('/stock/products', {
        params: { pageSize: 100 },
      });
      return data;
    },
  });

  const summary = useQuery({
    enabled: Boolean(company),
    queryKey: ['stock-summary', company?.id],
    queryFn: async () => {
      const { data } = await api.get<{ rows: any[]; totalValue: number }>('/stock/summary');
      return data;
    },
  });

  const movements = useQuery({
    enabled: Boolean(company),
    queryKey: ['stock-movements', company?.id],
    queryFn: async () => {
      const { data } = await api.get<Paginated<StockMovement>>('/stock/movements', {
        params: { pageSize: 25 },
      });
      return data;
    },
  });

  const options = useQuery({
    enabled: Boolean(company) && canWrite,
    queryKey: ['product-options', company?.id],
    queryFn: async () => {
      const { data } = await api.get<any[]>('/stock/products/options');
      return data;
    },
  });

  async function submitProduct() {
    const form = productForm;
    if (!form.code.trim() || !form.name.trim() || !form.inventoryAccountId) {
      toast.error('Preencha código, nome e conta contábil de estoque.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        category: form.category.trim() || 'Geral',
        unit: form.unit.trim() || 'UN',
        minimumStock: Number(form.minimumStock) || 0,
        salePrice: Number(form.salePrice) || 0,
        inventoryAccountId: form.inventoryAccountId,
        ...(form.revenueAccountId ? { revenueAccountId: form.revenueAccountId } : {}),
        ...(form.cmvAccountId ? { cmvAccountId: form.cmvAccountId } : {}),
      };
      if (form.id) {
        await api.patch(`/stock/products/${form.id}`, {
          name: payload.name,
          category: payload.category,
          unit: payload.unit,
          minimumStock: payload.minimumStock,
          salePrice: payload.salePrice,
        });
      } else {
        await api.post('/stock/products', payload);
      }
      toast.success(form.id ? 'Produto atualizado.' : 'Produto cadastrado.');
      setProductOpen(false);
      setProductForm(emptyProduct);
      void queryClient.invalidateQueries();
    } catch (error: any) {
      toast.error(error?.message ?? 'Falha ao salvar produto.');
    } finally {
      setSaving(false);
    }
  }

  async function submitMovement() {
    const form = movementForm;
    if (!form.productId || !form.quantity || Number(form.quantity) <= 0) {
      toast.error('Selecione o produto e informe a quantidade.');
      return;
    }
    if (form.type !== 'SAIDA' && (!form.unitValue || Number(form.unitValue) <= 0)) {
      toast.error('Informe o valor unitário da operação.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/stock/movements', {
        productId: form.productId,
        type: form.type,
        date: form.date,
        quantity: Number(form.quantity),
        unitValue: Number(form.unitValue) || undefined,
        paymentMethod: form.paymentMethod,
        ...(form.documentNumber ? { documentNumber: form.documentNumber } : {}),
        ...(form.description ? { description: form.description } : {}),
        ...(form.type === 'VENDA' && form.customerId ? { customerId: form.customerId } : {}),
        ...(form.type === 'COMPRA' && form.supplierId ? { supplierId: form.supplierId } : {}),
      });
      toast.success('Movimentação registrada e contabilizada!');
      setMovementOpen(false);
      setMovementForm(emptyMovement);
      void queryClient.invalidateQueries();
    } catch (error: any) {
      toast.error(error?.message ?? 'Falha na movimentação.');
    } finally {
      setSaving(false);
    }
  }

  async function submitReverse() {
    if (!reverseTarget) return;
    if (reverseReason.trim().length < 5) {
      toast.error('Descreva o motivo do estorno.');
      return;
    }
    try {
      await api.post(`/stock/movements/${reverseTarget.id}/reverse`, { reason: reverseReason });
      toast.success('Movimentação estornada.');
      setReverseTarget(null);
      setReverseReason('');
      void queryClient.invalidateQueries();
    } catch (error: any) {
      toast.error(error?.message ?? 'Falha no estorno.');
    }
  }

  async function exportReport(format: 'xlsx' | 'pdf') {
    try {
      await downloadFile('/export/stock', { format }, `estoque.${format}`);
    } catch {
      toast.error('Falha na exportação.');
    }
  }

  if (!company) return <EmptyCompany />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 font-display text-navy-900">Estoque</h1>
          <p className="text-body-sm text-slate-500">
            Controle de mercadorias com custo médio ponderado móvel e escrituração automática.
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
            <>
              <Button
                variant="gold"
                size="sm"
                onClick={() => {
                  setMovementForm(emptyMovement);
                  setMovementOpen(true);
                }}
              >
                <PackagePlus className="h-4 w-4" /> Nova movimentação
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setProductForm(emptyProduct);
                  setProductOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Novo produto
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Cards resumo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-body-sm text-slate-500">Valor total do estoque</p>
            <p className="text-h2 font-display text-navy-900 tabular">
              {formatCurrency(summary.data?.totalValue ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-body-sm text-slate-500">Produtos ativos</p>
            <p className="text-h2 font-display text-navy-900">{summary.data?.rows.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-body-sm text-slate-500">Abaixo do mínimo</p>
            <p className="text-h2 font-display text-amber-600">
              {(summary.data?.rows ?? []).filter((row) => row.lowStock).length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="produtos">
        <TabsList>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="movimentacoes">Movimentações</TabsTrigger>
        </TabsList>

        <TabsContent value="produtos">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/60">
                    <TableHead className="w-24">Código</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="w-28">Un.</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead className="text-right">Custo médio</TableHead>
                    <TableHead className="text-right">Preço venda</TableHead>
                    <TableHead className="text-right">Valor estoque</TableHead>
                    <TableHead>Conta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                    {(summary.data?.rows ?? []).map((row) => (
                      <TableRow key={row.id} className={row.lowStock ? 'bg-amber-50/60' : undefined}>
                        <TableCell className="text-slate-500">{row.code}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {row.lowStock && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                            <span className="font-medium">{row.name}</span>
                          </div>
                          <span className="text-xs text-slate-400">{row.category}</span>
                        </TableCell>
                        <TableCell>{row.unit}</TableCell>
                        <TableCell className="text-right tabular">{row.quantity}</TableCell>
                        <TableCell className="text-right tabular">{formatCurrency(row.averageCost)}</TableCell>
                        <TableCell className="text-right tabular">{formatCurrency(row.salePrice)}</TableCell>
                        <TableCell className="text-right font-semibold tabular">
                          {formatCurrency(row.stockValue)}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {row.inventoryAccount?.code}
                        </TableCell>
                      </TableRow>
                    ))}
                    {products.data?.items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="py-10 text-center text-slate-400">
                          Nenhum produto cadastrado.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movimentacoes">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/60">
                    <TableHead className="w-28">Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Qtd.</TableHead>
                    <TableHead className="text-right">Valor total</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Doc.</TableHead>
                    <TableHead className="w-16">Lanç.</TableHead>
                    <TableHead className="w-14" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.data?.items.map((movement) => (
                    <TableRow key={movement.id} className={movement.type === 'ESTORNO' ? 'bg-red-50/40' : undefined}>
                      <TableCell>{formatDate(movement.date)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            movement.type === 'ESTORNO'
                              ? 'danger'
                              : OUT_TYPES.has(movement.type)
                                ? 'warning'
                                : 'success'
                          }
                        >
                          {MOVEMENT_LABELS[movement.type] ?? movement.type}
                        </Badge>
                      </TableCell>
                      <TableCell>{movement.product?.name}</TableCell>
                      <TableCell className="text-right tabular">{Number(movement.quantity)}</TableCell>
                      <TableCell className="text-right tabular">{formatCurrency(movement.totalValue)}</TableCell>
                      <TableCell className="text-body-sm text-slate-500">
                        {PAYMENT_LABELS[movement.paymentMethod] ?? movement.paymentMethod}
                      </TableCell>
                      <TableCell className="text-body-sm text-slate-500">
                        {movement.documentNumber ?? '—'}
                      </TableCell>
                      <TableCell className="text-body-sm text-slate-500">
                        {movement.entry ? `#${movement.entry.number}` : '—'}
                      </TableCell>
                      <TableCell>
                        {canWrite && movement.type !== 'ESTORNO' && movement.status !== 'ESTORNADO' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Estornar"
                            onClick={() => setReverseTarget(movement)}
                          >
                            <Undo2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {movements.data?.items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="py-10 text-center text-slate-400">
                        Nenhuma movimentação registrada.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Diálogo produto */}
      <Dialog open={productOpen} onOpenChange={setProductOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{productForm.id ? 'Editar produto' : 'Novo produto'}</DialogTitle>
            <DialogDescription>
              O produto usa custo médio ponderado móvel e gera lançamentos contábeis automáticos.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Código" required>
              <Input
                value={productForm.code}
                onChange={(event) => setProductForm((prev) => ({ ...prev, code: event.target.value }))}
                placeholder="PRD-001"
                disabled={Boolean(productForm.id)}
              />
            </Field>
            <Field label="Nome" required>
              <Input
                value={productForm.name}
                onChange={(event) => setProductForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Farinha de trigo 1kg"
              />
            </Field>
            <Field label="Categoria">
              <Input
                value={productForm.category}
                onChange={(event) => setProductForm((prev) => ({ ...prev, category: event.target.value }))}
                placeholder="Alimentos"
                list="categories"
              />
              <datalist id="categories">
                {(products.data?.categories ?? []).map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </Field>
            <Field label="Unidade" required>
              <Input
                value={productForm.unit}
                onChange={(event) => setProductForm((prev) => ({ ...prev, unit: event.target.value }))}
                placeholder="UN / KG / L"
              />
            </Field>
            <Field label="Estoque mínimo">
              <Input
                type="number"
                min="0"
                value={productForm.minimumStock}
                onChange={(event) => setProductForm((prev) => ({ ...prev, minimumStock: event.target.value }))}
              />
            </Field>
            <Field label="Preço de venda">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={productForm.salePrice}
                onChange={(event) => setProductForm((prev) => ({ ...prev, salePrice: event.target.value }))}
              />
            </Field>
            {!productForm.id && (
              <>
                <Field label="Conta de estoque" required>
                  <Select
                    value={productForm.inventoryAccountId}
                    onValueChange={(value) => setProductForm((prev) => ({ ...prev, inventoryAccountId: value }))}
                  >
                    <SelectTrigger>
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
                </Field>
                <Field label="Conta de receita" hint="Usada nas vendas deste produto.">
                  <Select
                    value={productForm.revenueAccountId}
                    onValueChange={(value) => setProductForm((prev) => ({ ...prev, revenueAccountId: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Padrão do sistema" />
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
                <Field label="Conta de CMV" hint="Custo das mercadorias vendidas.">
                  <Select
                    value={productForm.cmvAccountId}
                    onValueChange={(value) => setProductForm((prev) => ({ ...prev, cmvAccountId: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Padrão do sistema" />
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
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitProduct} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo movimentação */}
      <Dialog open={movementOpen} onOpenChange={setMovementOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova movimentação de estoque</DialogTitle>
            <DialogDescription>
              Compras e vendas geram lançamentos contábeis automaticamente (partidas dobradas).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo" required>
              <Select
                value={movementForm.type}
                onValueChange={(value) => setMovementForm((prev) => ({ ...prev, type: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPRA">Compra</SelectItem>
                  <SelectItem value="VENDA">Venda</SelectItem>
                  <SelectItem value="ENTRADA">Entrada por ajuste</SelectItem>
                  <SelectItem value="SAIDA">Saída por ajuste</SelectItem>
                  <SelectItem value="DEVOLUCAO_VENDA">Devolução de venda</SelectItem>
                  <SelectItem value="DEVOLUCAO_COMPRA">Devolução de compra</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Produto" required>
              <Select
                value={movementForm.productId}
                onValueChange={(value) => setMovementForm((prev) => ({ ...prev, productId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {(options.data ?? []).map((product: any) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.code} — {product.name} ({Number(product.quantity).toFixed(0)} {product.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Data" required>
              <Input
                type="date"
                value={movementForm.date}
                onChange={(event) => setMovementForm((prev) => ({ ...prev, date: event.target.value }))}
              />
            </Field>
            <Field
              label="Quantidade"
              required
              hint={
                movementForm.type === 'SAIDA'
                  ? 'Saidas por ajuste usam o custo médio atual.'
                  : undefined
              }
            >
              <Input
                type="number"
                step="0.001"
                min="0"
                value={movementForm.quantity}
                onChange={(event) => setMovementForm((prev) => ({ ...prev, quantity: event.target.value }))}
                placeholder="0"
              />
            </Field>
            <Field
              label={
                movementForm.type === 'VENDA' || movementForm.type === 'DEVOLUCAO_VENDA'
                  ? 'Valor unitário de venda'
                  : 'Valor unitário (custo)'
              }
              required={movementForm.type !== 'SAIDA'}
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                value={movementForm.unitValue}
                onChange={(event) => setMovementForm((prev) => ({ ...prev, unitValue: event.target.value }))}
                placeholder="0,00"
              />
            </Field>
            <Field label="Forma de pagamento" required>
              <Select
                value={movementForm.paymentMethod}
                onValueChange={(value) => setMovementForm((prev) => ({ ...prev, paymentMethod: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DINHEIRO">Dinheiro (Caixa)</SelectItem>
                  <SelectItem value="BANCO">Banco</SelectItem>
                  <SelectItem value="A_PRAZO">A prazo (fornecedores/clientes)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Documento">
              <Input
                value={movementForm.documentNumber}
                onChange={(event) => setMovementForm((prev) => ({ ...prev, documentNumber: event.target.value }))}
                placeholder="NF-1234"
              />
            </Field>
            {movementForm.type === 'VENDA' && (
              <Field label="Cliente">
                <Input
                  value={movementForm.customerId}
                  onChange={(event) => setMovementForm((prev) => ({ ...prev, customerId: event.target.value }))}
                  placeholder="ID do cliente (opcional)"
                />
              </Field>
            )}
            {movementForm.type === 'COMPRA' && (
              <Field label="Fornecedor">
                <Input
                  value={movementForm.supplierId}
                  onChange={(event) => setMovementForm((prev) => ({ ...prev, supplierId: event.target.value }))}
                  placeholder="ID do fornecedor (opcional)"
                />
              </Field>
            )}
            <Field label="Descrição" className="sm:col-span-2">
              <Textarea
                value={movementForm.description}
                onChange={(event) => setMovementForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Observações sobre a operação…"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovementOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitMovement} disabled={saving}>
              {saving ? 'Registrando…' : 'Registrar e contabilizar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo estorno */}
      <Dialog open={Boolean(reverseTarget)} onOpenChange={(value) => !value && setReverseTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Estornar movimentação</DialogTitle>
            <DialogDescription>
              O estoque será devolvido e todos os lançamentos contábeis gerados serão estornados.
            </DialogDescription>
          </DialogHeader>
          <Field label="Motivo do estorno" required>
            <Textarea
              value={reverseReason}
              onChange={(event) => setReverseReason(event.target.value)}
              placeholder="Ex.: Compra lançada com valor incorreto."
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseTarget(null)}>
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
