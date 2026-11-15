'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpenCheck, UserPlus, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { useAuth } from '@/components/providers/auth-provider';

export default function RegisterPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [form, setForm] = React.useState({
    name: '',
    email: '',
    password: '',
    inviteCode: '',
  });
  const [loading, setLoading] = React.useState(false);

  function update(field: keyof typeof form) {
    return (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (form.password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/register', {
        name: form.name,
        email: form.email,
        password: form.password,
        ...(form.inviteCode ? { inviteCode: form.inviteCode } : {}),
      });
      await refresh();
      toast.success('Conta criada! Vamos configurar sua primeira empresa.');
      router.push('/app/empresas');
      router.refresh();
    } catch (error: any) {
      toast.error(error?.message ?? 'Não foi possível criar a conta.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-950 p-6">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-navy-800 bg-white shadow-2xl md:grid-cols-2">
        <div className="hidden flex-col justify-between bg-navy-900 p-10 text-white md:flex">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-gold-500 text-navy-950">
              <BookOpenCheck className="h-6 w-6" />
            </span>
            <div>
              <p className="text-h1 font-display leading-none">Pacioli</p>
              <p className="text-body-sm text-navy-200">Contabilidade empresarial educacional</p>
            </div>
          </div>
          <p className="text-body-lg leading-relaxed text-navy-100">
            Crie sua conta de aluno e monte empresas simuladas com escrituração completa — do
            capital inicial ao balanço patrimonial.
          </p>
          <p className="text-xs text-navy-400">
            Alunos criam conta livremente. Professores precisam do código de convite institucional.
          </p>
        </div>

        <div className="flex flex-col justify-center gap-6 p-8 sm:p-10">
          <div>
            <h1 className="text-h1 font-display text-navy-900">Criar conta</h1>
            <p className="text-body-sm text-slate-500">
              Alunos têm acesso imediato; professores precisam do código de convite.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="Nome completo" required>
              <Input value={form.name} onChange={update('name')} placeholder="Seu nome" required />
            </Field>
            <Field label="E-mail" required>
              <Input
                type="email"
                value={form.email}
                onChange={update('email')}
                placeholder="voce@exemplo.com"
                autoComplete="email"
                required
              />
            </Field>
            <Field label="Senha" required hint="Mínimo de 6 caracteres.">
              <Input
                type="password"
                value={form.password}
                onChange={update('password')}
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />
            </Field>
            <Field
              label="Código de convite (professores)"
              hint="Deixe em branco para criar conta de aluno."
            >
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={form.inviteCode}
                  onChange={update('inviteCode')}
                  placeholder="PACIOLI-PROF-…"
                  className="pl-9"
                />
              </div>
            </Field>
            <Button type="submit" size="lg" disabled={loading} className="mt-1 w-full">
              <UserPlus className="h-4 w-4" />
              {loading ? 'Criando…' : 'Criar conta'}
            </Button>
          </form>

          <p className="text-center text-body-sm text-slate-500">
            <Link href="/" className="font-semibold text-navy-700 hover:underline">
              Voltar para o início
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
