'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, setActiveCompany } from '@/lib/api';
import type { AuthUser, CompanySummary } from '@/lib/types';

const COMPANY_STORAGE_KEY = 'pacioli.companyId';

interface AuthContextValue {
  user: AuthUser | null;
  companies: CompanySummary[];
  company: CompanySummary | null;
  loading: boolean;
  selectedCompanyId: string | null;
  selectCompany: (companyId: string | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  /** Cria uma sessão descartável de visitante (sem cadastro) e a carrega. */
  startGuest: () => Promise<AuthUser>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [companies, setCompanies] = React.useState<CompanySummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedCompanyId, setSelectedCompanyId] = React.useState<string | null>(null);

  const applyCompany = React.useCallback((companyId: string | null) => {
    setSelectedCompanyId(companyId);
    setActiveCompany(companyId);
    if (typeof window !== 'undefined') {
      if (companyId) window.localStorage.setItem(COMPANY_STORAGE_KEY, companyId);
      else window.localStorage.removeItem(COMPANY_STORAGE_KEY);
    }
  }, []);

  const refresh = React.useCallback(async () => {
    try {
      const { data } = await api.get<{ user: AuthUser; companies: CompanySummary[] }>('/auth/me');
      setUser(data.user);
      setCompanies(data.companies);
      const stored =
        typeof window !== 'undefined' ? window.localStorage.getItem(COMPANY_STORAGE_KEY) : null;
      const valid = data.companies.find((company) => company.id === stored);
      applyCompany(valid ? stored : (data.companies[0]?.id ?? null));
    } catch {
      setUser(null);
      setCompanies([]);
      applyCompany(null);
    } finally {
      setLoading(false);
    }
  }, [applyCompany]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = React.useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
      setCompanies([]);
      applyCompany(null);
      toast.success('Sessão encerrada.');
      router.push('/');
    }
  }, [applyCompany, router]);

  const startGuest = React.useCallback(async () => {
    const { data } = await api.post<{ accessToken: string; user: AuthUser }>('/auth/guest');
    await refresh();
    return data.user;
  }, [refresh]);

  const company = companies.find((item) => item.id === selectedCompanyId) ?? null;

  return (
    <AuthContext.Provider
      value={{
        user,
        companies,
        company,
        loading,
        selectedCompanyId,
        selectCompany: applyCompany,
        refresh,
        logout,
        startGuest,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return context;
}
