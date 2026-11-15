'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Plus, Save, Settings2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatDate, SEGMENT_LABELS, STATUS_LABELS, toISODateInput } from '@/lib/format';
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

export default function ConfiguracoesPage() {
  const { company, user, refresh } = useAuth();
  const queryClient = useQueryClient();
  const isOwner = company?.isOwner === true && user?.role !== 'PROFESSOR';

  const [form, setForm] = React.useState({
    legalName: '',
    tradeName: '',
    cnpj: '',
    city: '',
    state: '',
    segment: 'COMERCIO',
  });
  const [saving, setSaving] = React.useState(false);
  const [periodOpen, setPeriodOpen] = React.useState(false);
  const [period, setPeriod] = React.useState({ name: '', startDate: '', endDate: '' });

  React.useEffect(() => {
    if (!company) return;
    setForm({
      legalName: company.legalName,
      tradeName: company.tradeName,
      cnpj: company.cnpj ?? '',
      city: company.city ?? '',
      state: company.state ?? '',
      segment: company.segment,
    });
  }, [company]);

  const periods = useQuery({
    enabled: Boolean(company),
    queryKey: ['periods', company?.id],
    queryFn: async () => {
      const { data } = await api.get<Period[]>('/periods');
      return data;
    },
  });

  const members = useQuery({
    enabled: Boolean(company),
    queryKey: ['members', company?.id],
    queryFn: async () => {
      const { data } = await api.get<{ members: any[] }>(`/companies/${company!.id}/members`);
      return data.members;
    },
  });

  async function saveCompany() {
    setSaving(true);
    try {
      await api.patch(`/companies/${company!.id}`, {
        legalName: form.legalName,
        tradeName: form.tradeName,
        ...(form.cnpj ? { cnpj: form.cnpj } : {}),
        city: form.city,
        state: form.state,
        segment: form.segment,
      });
      toast.success('Dados da empresa atualizados.');
      await refresh();
    } catch (error: any) {
      toast.error(error?.message ?? 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function createPeriod() {
    if (!period.name || !period.startDate || !period.endDate) {
      toast.error('Preencha todos os campos do período.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/periods', period);
      toast.success('Período contábil criado.');
      setPeriodOpen(false);
      setPeriod({ name: '', startDate: '', endDate: '' });
      void queryClient.invalidateQueries({ queryKey: ['periods'] });
    } catch (error: any) {
      toast.error(error?.message ?? 'Falha ao criar período.');
    } finally {
      setSaving(false);
    }
  }

  async function addMember() {
    const email = prompt('E-mail do usuário a convidar (deve já ter conta):');
    if (!email) return;
    try {
      await api.post(`/companies/${company!.id}/members`, { email });
      toast.success('Membro adicionado!');
      void queryClient.invalidateQueries({ queryKey: ['members'] });
    } catch (error: any) {
      toast.error(error?.message ?? 'Falha ao adicionar membro.');
    }
  }

  async function removeMember(memberId: string) {
    if (!confirm('Remover este membro da empresa?')) return;
    try {
      await api.delete(`/companies/${company!.id}/members/${memberId}`);
      toast.success('Membro removido.');
      void queryClient.invalidateQueries({ queryKey: ['members'] });
    } catch (error: any) {
      toast.error(error?.message ?? 'Falha ao remover membro.');
    }
  }

  if (!company) return <EmptyCompany />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1 font-display text-navy-900">Configurações</h1>
        <p className="text-body-sm text-slate-500">
          Dados cadastrais, períodos contábeis e membros de {company.tradeName}.
        </p>
      </div>

      <Tabs defaultValue="empresa">
        <TabsList>
          <TabsTrigger value="empresa" className="gap-2">
            <Settings2 className="h-4 w-4" /> Dados da empresa
          </TabsTrigger>
          <TabsTrigger value="periodos" className="gap-2">
            <CalendarRange className="h-4 w-4" /> Períodos
          </TabsTrigger>
          <TabsTrigger value="membros" className="gap-2">
            <Users className="h-4 w-4" /> Membros
          </TabsTrigger>
        </TabsList>

        <TabsContent value="empresa">
          <Card>
            <CardHeader>
              <CardTitle>Dados cadastrais</CardTitle>
              <CardDescription>Informações usadas nos relatórios e exportações.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Razão social" required>
                  <Input
                    value={form.legalName}
                    onChange={(event) => setForm((prev) => ({ ...prev, legalName: event.target.value }))}
                    disabled={!isOwner}
                  />
                </Field>
                <Field label="Nome fantasia" required>
                  <Input
                    value={form.tradeName}
                    onChange={(event) => setForm((prev) => ({ ...prev, tradeName: event.target.value }))}
                    disabled={!isOwner}
                  />
                </Field>
                <Field label="CNPJ">
                  <Input
                    value={form.cnpj}
                    onChange={(event) => setForm((prev) => ({ ...prev, cnpj: event.target.value }))}
                    disabled={!isOwner}
                  />
                </Field>
                <Field label="Segmento">
                  <Select
                    value={form.segment}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, segment: value }))}
                    disabled={!isOwner}
                  >
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
                <Field label="Cidade">
                  <Input
                    value={form.city}
                    onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
                    disabled={!isOwner}
                  />
                </Field>
                <Field label="UF">
                  <Input
                    value={form.state}
                    onChange={(event) => setForm((prev) => ({ ...prev, state: event.target.value }))}
                    maxLength={2}
                    disabled={!isOwner}
                  />
                </Field>
              </div>
              {isOwner && (
                <Button onClick={saveCompany} disabled={saving} className="self-start">
                  <Save className="h-4 w-4" />
                  {saving ? 'Salvando…' : 'Salvar alterações'}
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="periodos">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle>Períodos contábeis</CardTitle>
                <CardDescription>
                  Períodos definem o exercício; o encerramento acontece na página da DRE.
                </CardDescription>
              </div>
              {company.canWrite && user?.role !== 'PROFESSOR' && (
                <Button size="sm" onClick={() => setPeriodOpen(true)}>
                  <Plus className="h-4 w-4" /> Novo período
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/60">
                    <TableHead>Nome</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead>Fim</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Lançamentos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.isLoading && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-slate-400">
                        Carregando…
                      </TableCell>
                    </TableRow>
                  )}
                  {periods.data?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-slate-400">
                        Nenhum período criado.
                      </TableCell>
                    </TableRow>
                  )}
                  {periods.data?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{formatDate(item.startDate)}</TableCell>
                      <TableCell>{formatDate(item.endDate)}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === 'OPEN' ? 'success' : 'outline'}>
                          {STATUS_LABELS[item.status] ?? item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {(item as any)._count?.entries ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="membros">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle>Membros da empresa</CardTitle>
                <CardDescription>
                  Convide colegas ou o professor para acompanhar a empresa simulada.
                </CardDescription>
              </div>
              {isOwner && (
                <Button size="sm" onClick={addMember}>
                  <Plus className="h-4 w-4" /> Convidar
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-slate-100">
                {(members.data ?? []).map((member) => (
                  <div key={member.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-navy-100 text-xs font-bold text-navy-800">
                        {(member.user?.name ?? '?').slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <p className="font-semibold text-navy-900">{member.user?.name}</p>
                        <p className="text-body-sm text-slate-500">{member.user?.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="default">{member.role?.label ?? member.roleId}</Badge>
                      {isOwner && member.userId !== user?.id && (
                        <Button variant="ghost" size="sm" onClick={() => removeMember(member.id)}>
                          Remover
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {members.isLoading && <p className="py-10 text-center text-slate-400">Carregando…</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Diálogo novo período */}
      <Dialog open={periodOpen} onOpenChange={setPeriodOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo período contábil</DialogTitle>
            <DialogDescription>
              Os períodos não podem se sobrepor e não podem ser alterados após terem lançamentos.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Nome" required>
              <Input
                value={period.name}
                onChange={(event) => setPeriod((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Exercício 2027"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Início" required>
                <Input
                  type="date"
                  value={period.startDate}
                  onChange={(event) => setPeriod((prev) => ({ ...prev, startDate: event.target.value }))}
                />
              </Field>
              <Field label="Fim" required>
                <Input
                  type="date"
                  value={period.endDate}
                  onChange={(event) => setPeriod((prev) => ({ ...prev, endDate: event.target.value }))}
                />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPeriodOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={createPeriod} disabled={saving}>
              {saving ? 'Criando…' : 'Criar período'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
