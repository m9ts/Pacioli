'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, ChevronsRight, CircleDot, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, ROLE_LABELS, SEGMENT_LABELS, STATUS_LABELS, todayISO } from '@/lib/format';
import type { Account, CompanySummary } from '@/lib/types';
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

interface OpeningItem {
  kind: 'BEM' | 'DIREITO' | 'OBRIGACAO';
  description: string;
  accountId: string;
  value: string;
}

export default function EmpresasPage() {
  const { user, companies, company, selectCompany, refresh } = useAuth();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [create, setCreate] = React.useState({
    name: '',
    segment: 'COMERCIO',
    openingDate: todayISO(),
    initialCapital: '10000',
  });

  const [wizard, setWizard] = React.useState<CompanySummary | null>(null);
  const [step, setStep] = React.useState(1);
  const [period, setPeriod] = React.useState({ name: '', startDate: '', endDate: '' });
  const [capital, setCapital] = React.useState('0');
  const [items, setItems] = React.useState<OpeningItem[]>([]);

  const accounts = useQuery({
    enabled: Boolean(wizard),
    queryKey: ['accounts-options', company?.id],
    queryFn: async () => {
      const { data } = await api.get<Account[]>('/accounts');
      return data.filter((account) => account.type === 'ANALITICA' && account.active);
    },
  });

  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get('nova') === '1') {
      setCreateOpen(true);
    }
  }, []);

  async function submitCreate() {
    if (!create.name.trim()) {
      toast.error('Informe o nome da empresa.');
      return;
    }
    setSaving(true);
    try {
      const name = create.name.trim();
      const { data } = await api.post<CompanySummary>('/companies', {
        legalName: name,
        tradeName: name,
        segment: create.segment,
        openingDate: create.openingDate,
        responsibleName: user?.name || 'Responsável',
        initialCapital: Number(create.initialCapital) || 0,
      });
      toast.success('Empresa criada! Conclua a abertura para começar.');
      setCreateOpen(false);
      await refresh();
      setWizard(data);
      setStep(1);
      setPeriod({
        name: `Exercício ${new Date(create.openingDate).getFullYear()}`,
        startDate: `${new Date(create.openingDate).getFullYear()}-01-01`,
        endDate: `${new Date(create.openingDate).getFullYear()}-12-31`,
      });
      setCapital(create.initialCapital || '0');
      setItems([]);
    } catch (error: any) {
      toast.error(error?.message ?? 'Falha ao criar empresa.');
    } finally {
      setSaving(false);
    }
  }

  async function openWizard(target: CompanySummary) {
    setWizard(target);
    setStep(1);
    const year = new Date(target.openingDate).getFullYear();
    setPeriod({
      name: `Exercício ${year}`,
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
    });
    setCapital(String(Number(target.initialCapital) || 0));
    setItems([]);
  }

  const capitalTotal = Number(capital) || 0;
  const itemsTotal = items.reduce(
    (acc, item) => acc + (item.kind === 'OBRIGACAO' ? -(Number(item.value) || 0) : Number(item.value) || 0),
    0,
  );
  const expectedPl = capitalTotal + itemsTotal;

  async function submitOpening() {
    if (!wizard) return;
    if (!period.name || !period.startDate || !period.endDate) {
      toast.error('Preencha o período contábil.');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/companies/${wizard.id}/opening`, {
        period,
        capital: capitalTotal,
        ...(items.length > 0
          ? {
              items: items
                .filter((item) => item.accountId && Number(item.value) > 0)
                .map((item) => ({
                  kind: item.kind,
                  description: item.description || 'Patrimônio inicial',
                  accountId: item.accountId,
                  value: Number(item.value),
                })),
            }
          : {}),
      });
      toast.success('Abertura concluída! A empresa está pronta para o exercício.');
      setWizard(null);
      await Promise.all([refresh(), queryClient.invalidateQueries()]);
      selectCompany(wizard.id);
    } catch (error: any) {
      toast.error(error?.message ?? 'Falha na abertura.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 font-display text-navy-900">Minhas Empresas</h1>
          <p className="text-body-sm text-slate-500">
            Empresas simuladas em que você é proprietário(a) ou convidado(a).
          </p>
        </div>
        {user?.role !== 'PROFESSOR' && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Nova empresa
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {companies.map((item) => {
          const active = item.id === company?.id;
          return (
            <Card key={item.id} className={active ? 'border-navy-400 ring-2 ring-navy-400/30' : undefined}>
              <CardHeader>
                <CardTitle className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-navy-600" />
                    {item.tradeName}
                  </span>
                  <Badge variant={item.status === 'ACTIVE' ? 'success' : 'warning'}>
                    {STATUS_LABELS[item.status] ?? item.status}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {item.legalName}
                  {item.cnpj ? ` · CNPJ ${item.cnpj}` : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2 text-body-sm text-slate-500">
                  <span>Segmento</span>
                  <span className="text-right font-medium text-navy-800">
                    {SEGMENT_LABELS[item.segment] ?? item.segment}
                  </span>
                  <span>Abertura</span>
                  <span className="text-right font-medium text-navy-800">{formatDate(item.openingDate)}</span>
                  <span>Capital</span>
                  <span className="text-right font-medium text-navy-800 tabular">
                    {formatCurrency(item.initialCapital)}
                  </span>
                  <span>Meu papel</span>
                  <span className="text-right font-medium text-navy-800">
                    {ROLE_LABELS[item.accessRole] ?? item.accessRole}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={active ? 'outline' : 'default'}
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      selectCompany(item.id);
                      toast.success(`Empresa selecionada: ${item.tradeName}`);
                    }}
                  >
                    {active ? <Check className="h-4 w-4" /> : 'Selecionar'}
                    {active ? 'Selecionada' : ''}
                  </Button>
                  {item.status === 'DRAFT' && item.canWrite && (
                    <Button variant="gold" size="sm" onClick={() => openWizard(item)}>
                      <ChevronsRight className="h-4 w-4" />
                      Concluir abertura
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {companies.length === 0 && (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="py-16 text-center">
              <p className="font-semibold text-navy-900">Nenhuma empresa ainda</p>
              <p className="text-body-sm text-slate-500">
                Crie sua primeira empresa simulada para começar a praticar.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Diálogo nova empresa */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova empresa simulada</DialogTitle>
            <DialogDescription>
              Depois da criação, um assistente guia a abertura: período contábil e patrimônio inicial.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome da empresa" required className="sm:col-span-2">
              <Input
                value={create.name}
                onChange={(event) => setCreate((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Padaria Exemplo"
                autoFocus
              />
            </Field>
            <Field label="Segmento">
              <Select
                value={create.segment}
                onValueChange={(value) => setCreate((prev) => ({ ...prev, segment: value }))}
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
            <Field label="Data de abertura" required>
              <Input
                type="date"
                value={create.openingDate}
                onChange={(event) => setCreate((prev) => ({ ...prev, openingDate: event.target.value }))}
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
                value={create.initialCapital}
                onChange={(event) => setCreate((prev) => ({ ...prev, initialCapital: event.target.value }))}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitCreate} disabled={saving}>
              {saving ? 'Criando…' : 'Criar empresa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assistente de abertura */}
      <Dialog open={Boolean(wizard)} onOpenChange={(value) => !value && setWizard(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Abertura de {wizard?.tradeName}</DialogTitle>
            <DialogDescription>
              Passo {step} de 2 — {step === 1 ? 'Período contábil e capital' : 'Patrimônio inicial (opcional)'}
            </DialogDescription>
          </DialogHeader>

          {step === 1 && (
            <div className="flex flex-col gap-3">
              <Field label="Nome do período" required>
                <Input
                  value={period.name}
                  onChange={(event) => setPeriod((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Exercício 2026"
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
              <Field
                label="Capital social integralizado"
                hint="Será lançado como Crédito no Capital Social e Débito no Caixa."
              >
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={capital}
                  onChange={(event) => setCapital(event.target.value)}
                />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-3">
              <p className="text-body-sm text-slate-500">
                Adicione bens, direitos e obrigações que a empresa já possui na abertura
                (opcional). Obras: a conta{" "}
                <strong>Lucros ou Prejuízos Acumulados</strong> receberá o complemento para o
                balanço fechar.
              </p>
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-[130px_1fr_150px] gap-2">
                  <Select
                    value={item.kind}
                    onValueChange={(value) =>
                      setItems((prev) => prev.map((row, i) => (i === index ? { ...row, kind: value as any } : row)))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BEM">Bem</SelectItem>
                      <SelectItem value="DIREITO">Direito</SelectItem>
                      <SelectItem value="OBRIGACAO">Obrigação</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={item.accountId}
                    onValueChange={(value) =>
                      setItems((prev) => prev.map((row, i) => (i === index ? { ...row, accountId: value } : row)))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Conta contábil" />
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
                    placeholder="Valor"
                    value={item.value}
                    onChange={(event) =>
                      setItems((prev) => prev.map((row, i) => (i === index ? { ...row, value: event.target.value } : row)))
                    }
                  />
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() =>
                  setItems((prev) => [
                    ...prev,
                    { kind: 'BEM', description: '', accountId: '', value: '' },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar item
              </Button>
              <div className="rounded-lg bg-slate-50 p-3 text-body-sm">
                <span className="text-slate-500">Capital + itens = </span>
                <strong className="tabular">{formatCurrency(expectedPl)}</strong>
                <span className="text-slate-500"> no Patrimônio Líquido</span>
              </div>
            </div>
          )}

          <DialogFooter>
            {step === 2 && (
              <Button variant="ghost" onClick={() => setStep(1)}>
                Voltar
              </Button>
            )}
            {step === 1 ? (
              <Button onClick={() => setStep(2)}>
                Continuar <ChevronsRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={submitOpening} disabled={saving}>
                <CircleDot className="h-4 w-4" />
                {saving ? 'Concluindo…' : 'Concluir abertura'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
