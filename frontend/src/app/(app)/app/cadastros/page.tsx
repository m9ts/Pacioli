'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Truck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyCompany } from '@/components/empty-company';

interface Partner {
  id: string;
  name: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  active: boolean;
}

const EMPTY = { name: '', document: '', email: '', phone: '', address: '' };

export default function CadastrosPage() {
  const { company, user } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = company?.canWrite !== false && user?.role !== 'PROFESSOR';
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<'customer' | 'supplier'>('customer');
  const [form, setForm] = React.useState(EMPTY);
  const [saving, setSaving] = React.useState(false);

  const customers = useQuery({
    enabled: Boolean(company),
    queryKey: ['customers', company?.id],
    queryFn: async () => {
      const { data } = await api.get<Partner[]>('/partners/customer');
      return data;
    },
  });

  const suppliers = useQuery({
    enabled: Boolean(company),
    queryKey: ['suppliers', company?.id],
    queryFn: async () => {
      const { data } = await api.get<Partner[]>('/partners/supplier');
      return data;
    },
  });

  async function submit() {
    if (!form.name.trim()) {
      toast.error('Informe o nome.');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/partners/${kind}`, {
        name: form.name.trim(),
        ...(form.document ? { document: form.document } : {}),
        ...(form.email ? { email: form.email } : {}),
        ...(form.phone ? { phone: form.phone } : {}),
        ...(form.address ? { address: form.address } : {}),
      });
      toast.success(kind === 'customer' ? 'Cliente cadastrado.' : 'Fornecedor cadastrado.');
      setOpen(false);
      setForm(EMPTY);
      void queryClient.invalidateQueries();
    } catch (error: any) {
      toast.error(error?.message ?? 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(target: { kind: string; partner: Partner }) {
    if (!confirm(`Excluir ${target.partner.name}?`)) return;
    try {
      await api.delete(`/partners/${target.kind}/${target.partner.id}`);
      toast.success('Cadastro excluído.');
      void queryClient.invalidateQueries();
    } catch (error: any) {
      toast.error(error?.message ?? 'Falha ao excluir.');
    }
  }

  if (!company) return <EmptyCompany />;

  const table = (data: Partner[] | undefined, kindKey: string, loading: boolean) => (
    <Table {...{}}>
      <thead>
        <tr className="border-b bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
          <th className="px-3 py-2 text-left">Nome</th>
          <th className="px-3 py-2 text-left">Documento</th>
          <th className="px-3 py-2 text-left">Contato</th>
          <th className="px-3 py-2 text-left">Endereço</th>
          <th className="w-24 px-3 py-2 text-right" />
        </tr>
      </thead>
      <tbody>
        {loading && (
          <tr>
            <td colSpan={5} className="py-10 text-center text-slate-400">
              Carregando…
            </td>
          </tr>
        )}
        {!loading && data && data.length === 0 && (
          <tr>
            <td colSpan={5} className="py-10 text-center text-slate-400">
              Nenhum cadastro.
            </td>
          </tr>
        )}
        {!loading &&
          (data ?? []).map((partner) => (
            <tr key={partner.id} className="border-b border-slate-100 hover:bg-slate-50/60">
              <td className="px-3 py-2.5">
                <span className="font-medium text-navy-900">{partner.name}</span>
                {!partner.active && (
                  <Badge variant="outline" className="ml-2">
                    Inativo
                  </Badge>
                )}
              </td>
              <td className="px-3 py-2.5 text-slate-500">{partner.document ?? '—'}</td>
              <td className="px-3 py-2.5 text-slate-500">
                {partner.phone ?? '—'}
                {partner.email ? ` · ${partner.email}` : ''}
              </td>
              <td className="max-w-xs truncate px-3 py-2.5 text-slate-500">{partner.address ?? '—'}</td>
              <td className="px-3 py-2.5 text-right">
                {canWrite && (
                  <Button variant="ghost" size="icon" onClick={() => remove({ kind: kindKey, partner })}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </td>
            </tr>
          ))}
      </tbody>
    </Table>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 font-display text-navy-900">Clientes & Fornecedores</h1>
          <p className="text-body-sm text-slate-500">
            Cadastros usados nas movimentações de estoque (compras e vendas).
          </p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => { setForm(EMPTY); setOpen(true); }}>
            <Plus className="h-4 w-4" /> Novo cadastro
          </Button>
        )}
      </div>

      <Tabs defaultValue="clientes">
        <TabsList>
          <TabsTrigger value="clientes" className="gap-2">
            <Users className="h-4 w-4" /> Clientes ({customers.data?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="fornecedores" className="gap-2">
            <Truck className="h-4 w-4" /> Fornecedores ({suppliers.data?.length ?? 0})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="clientes">
          <Card>
            <CardContent className="p-0">{table(customers.data, 'customer', customers.isLoading)}</CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="fornecedores">
          <Card>
            <CardContent className="p-0">{table(suppliers.data, 'supplier', suppliers.isLoading)}</CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo cadastro</DialogTitle>
            <DialogDescription>Cliente ou fornecedor da empresa simulada.</DialogDescription>
          </DialogHeader>
          <Field label="Tipo" required>
            <Select value={kind} onValueChange={(value) => setKind(value as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Cliente</SelectItem>
                <SelectItem value="supplier">Fornecedor</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome" required className="sm:col-span-2">
              <Input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Razão social ou nome"
              />
            </Field>
            <Field label="CNPJ / CPF">
              <Input
                value={form.document}
                onChange={(event) => setForm((prev) => ({ ...prev, document: event.target.value }))}
                placeholder="000.000.000-00"
              />
            </Field>
            <Field label="Telefone">
              <Input
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                placeholder="(00) 0000-0000"
              />
            </Field>
            <Field label="E-mail">
              <Input
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </Field>
            <Field label="Endereço" className="sm:col-span-2">
              <Input
                value={form.address}
                onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                placeholder="Rua, número, bairro, cidade"
              />
            </Field>
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

function Table({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}
