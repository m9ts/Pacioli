'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, FileDown, FileSpreadsheet, FolderTree, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, downloadFile } from '@/lib/api';
import type { Account } from '@/lib/types';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { EmptyCompany } from '@/components/empty-company';

const CLASSIFICATION_LABELS: Record<string, string> = {
  ATIVO: 'Ativo',
  PASSIVO: 'Passivo',
  PATRIMONIO_LIQUIDO: 'Patrimônio Líquido',
  RECEITA: 'Receita',
  DESPESA: 'Despesa',
  CUSTO: 'Custo',
  OUTRAS: 'Outras',
};

interface FormState {
  id?: string;
  code: string;
  name: string;
  classification: string;
  nature: 'DEVEDORA' | 'CREDORA';
  type: 'SINTETICA' | 'ANALITICA';
  parentId: string;
}

export default function PlanoDeContasPage() {
  const { company, user } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = company?.canWrite !== false && user?.role !== 'PROFESSOR';
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>({
    code: '',
    name: '',
    classification: 'ATIVO',
    nature: 'DEVEDORA',
    type: 'ANALITICA',
    parentId: '',
  });
  const [saving, setSaving] = React.useState(false);

  const accounts = useQuery({
    enabled: Boolean(company),
    queryKey: ['accounts-tree', company?.id],
    queryFn: async () => {
      const { data } = await api.get<Account[]>('/accounts');
      return data;
    },
  });

  const byParent = React.useMemo(() => {
    const map = new Map<string | null, Account[]>();
    for (const account of accounts.data ?? []) {
      const key = account.parentId ?? null;
      map.set(key, [...(map.get(key) ?? []), account]);
    }
    return map;
  }, [accounts.data]);

  async function submit() {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error('Informe o código e o nome da conta.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        classification: form.classification,
        nature: form.nature,
        type: form.type,
        ...(form.parentId ? { parentId: form.parentId } : {}),
      };
      if (form.id) {
        await api.patch(`/accounts/${form.id}`, { name: payload.name });
      } else {
        await api.post('/accounts', payload);
      }
      toast.success(form.id ? 'Conta atualizada.' : 'Conta criada.');
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['accounts-tree'] });
    } catch (error: any) {
      toast.error(error?.message ?? 'Falha ao salvar conta.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(account: Account) {
    if (!confirm(`Excluir a conta ${account.code} — ${account.name}?`)) return;
    try {
      await api.delete(`/accounts/${account.id}`);
      toast.success('Conta excluída.');
      void queryClient.invalidateQueries({ queryKey: ['accounts-tree'] });
    } catch (error: any) {
      toast.error(error?.message ?? 'Falha ao excluir conta.');
    }
  }

  async function exportReport(format: 'xlsx' | 'pdf') {
    try {
      await downloadFile('/export/accounts', { format }, `plano-de-contas.${format}`);
    } catch {
      toast.error('Falha na exportação.');
    }
  }

  function startCreate(parent?: Account) {
    setForm({
      code: '',
      name: '',
      classification: parent?.classification ?? 'ATIVO',
      nature: (parent?.nature ?? 'DEVEDORA') as 'DEVEDORA' | 'CREDORA',
      type: 'ANALITICA',
      parentId: parent?.id ?? '',
    });
    setOpen(true);
  }

  function renderRows(parent: string | null, depth: number): React.ReactNode[] {
    const children = byParent.get(parent) ?? [];
    return children.flatMap((account) => [
      <React.Fragment key={account.id}>
        <TableRow className={cn(!account.active && 'opacity-50')}>
          <TableCell style={{ paddingLeft: `${depth * 20 + 12}px` }}>
            <div className="flex items-center gap-1">
              {depth > 0 && <ChevronRight className="h-3 w-3 text-slate-300" />}
              <span className="font-semibold text-navy-900">{account.code}</span>
            </div>
          </TableCell>
          <TableCell>
            <span className={cn('font-medium', account.type === 'SINTETICA' && 'text-slate-500')}>
              {account.name}
            </span>
            {account.referenceCode && (
              <Badge variant="gold" className="ml-2">
                sistema
              </Badge>
            )}
          </TableCell>
          <TableCell>
            <Badge variant="outline">{CLASSIFICATION_LABELS[account.classification] ?? account.classification}</Badge>
          </TableCell>
          <TableCell className="text-center text-slate-500">
            {account.nature === 'DEVEDORA' ? 'Devedora' : 'Credora'}
          </TableCell>
          <TableCell className="text-center">
            {account.type === 'ANALITICA' ? <Badge variant="default">Analítica</Badge> : <Badge variant="outline">Sintética</Badge>}
          </TableCell>
          <TableCell className="text-center tabular text-slate-500">{account.lineCount}</TableCell>
          <TableCell>
            <div className="flex items-center justify-end gap-1">
              {canWrite && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startCreate(account)}
                    title="Adicionar conta filha"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  {account.canDelete && (
                    <Button variant="ghost" size="sm" onClick={() => remove(account)} title="Excluir">
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  )}
                </>
              )}
            </div>
          </TableCell>
        </TableRow>
      </React.Fragment>,
      ...renderRows(account.id, depth + 1),
    ]);
  }

  if (!company) return <EmptyCompany />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 font-display text-navy-900">Plano de Contas</h1>
          <p className="text-body-sm text-slate-500">
            Estrutura de contas da empresa — contas de sistema (marcadas) alimentam a escrituração automática.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportReport('xlsx')}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportReport('pdf')}>
            <FileDown className="h-4 w-4" /> PDF
          </Button>
          {canWrite && (
            <Button size="sm" onClick={() => startCreate()}>
              <Plus className="h-4 w-4" /> Nova conta
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-navy-700" />
            Estrutura hierárquica
          </CardTitle>
          <CardDescription>{accounts.data?.length ?? 0} conta(s) cadastradas</CardDescription>
        </CardHeader>
        <CardContent className="p-0 pb-1">
          <div className="overflow-x-auto px-5">
            <table className="w-full min-w-[860px] text-body-sm">
              <thead>
                <tr className="border-b bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
                  <th className="w-24 px-3 py-2 text-left">Código</th>
                  <th className="px-3 py-2 text-left">Conta</th>
                  <th className="w-40 px-3 py-2 text-left">Classificação</th>
                  <th className="w-28 px-3 py-2 text-center">Natureza</th>
                  <th className="w-24 px-3 py-2 text-center">Tipo</th>
                  <th className="w-20 px-3 py-2 text-center">Lanç.</th>
                  <th className="w-28 px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {accounts.isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Carregando plano de contas…
                    </td>
                  </tr>
                ) : accounts.data && accounts.data.length > 0 ? (
                  renderRows(null, 0)
                ) : (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Nenhuma conta cadastrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Diálogo de conta */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar conta' : 'Nova conta'}</DialogTitle>
            <DialogDescription>
              {form.parentId ? 'A conta será criada sob a conta sintética selecionada.' : 'Crie uma conta de primeiro nível.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Código" required>
              <Input
                value={form.code}
                onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
                placeholder="Ex.: 1.1.01.003"
                disabled={Boolean(form.id)}
              />
            </Field>
            <Field label="Nome" required>
              <Input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Ex.: Aplicações financeiras"
              />
            </Field>
            {!form.id && (
              <>
                <Field label="Classificação">
                  <Select
                    value={form.classification}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, classification: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CLASSIFICATION_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Natureza">
                  <Select
                    value={form.nature}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, nature: value as any }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DEVEDORA">Devedora</SelectItem>
                      <SelectItem value="CREDORA">Credora</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Tipo">
                  <Select
                    value={form.type}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, type: value as any }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ANALITICA">Analítica (movimentável)</SelectItem>
                      <SelectItem value="SINTETICA">Sintética (agregadora)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
