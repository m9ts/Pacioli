export function formatCurrency(value: number | string | null | undefined, prefix = 'R$'): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return `${prefix} 0,00`;
  return `${n < 0 ? '-' : ''}${prefix} ${Math.abs(n)
    .toFixed(2)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

export function formatNumber(value: number | string | null | undefined, decimals = 2): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0';
  return n
    .toFixed(decimals)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Aceita '2026-03-15T00:00:00.000Z', Date ou '2026-03-15' — sempre DD/MM/AAAA. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const iso = typeof value === 'string' ? value : value.toISOString();
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function formatMonthLabel(month: string): string {
  const names = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const [year, m] = month.split('-');
  return `${names[Number(m) - 1]}/${year.slice(2)}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function toISODateInput(value: string | Date | null | undefined): string {
  if (!value) return '';
  const iso = typeof value === 'string' ? value : value.toISOString();
  return iso.slice(0, 10);
}

export const SOURCE_LABELS: Record<string, string> = {
  MANUAL: 'Manual',
  ABERTURA: 'Abertura',
  SALDO_INICIAL: 'Saldos iniciais',
  COMPRA: 'Compra',
  VENDA: 'Venda',
  AJUSTE_ESTOQUE: 'Ajuste de estoque',
  DEVOLUCAO: 'Devolução',
  AQUISICAO_ATIVO: 'Aquisição de ativo',
  BAIXA_ATIVO: 'Baixa de ativo',
  DEPRECIACAO: 'Depreciação',
  ENCERRAMENTO: 'Encerramento',
  ESTORNO: 'Estorno',
};

export const MOVEMENT_LABELS: Record<string, string> = {
  COMPRA: 'Compra',
  VENDA: 'Venda',
  ENTRADA: 'Entrada (ajuste)',
  SAIDA: 'Saída (ajuste)',
  AJUSTE: 'Ajuste',
  DEVOLUCAO_VENDA: 'Devolução de venda',
  DEVOLUCAO_COMPRA: 'Devolução de compra',
  ESTORNO: 'Estorno',
};

export const PAYMENT_LABELS: Record<string, string> = {
  DINHEIRO: 'Dinheiro (Caixa)',
  BANCO: 'Banco',
  A_PRAZO: 'A prazo',
};

export const STATUS_LABELS: Record<string, string> = {
  ATIVO: 'Ativo',
  TRANSFERIDO: 'Transferido',
  BAIXADO: 'Baixado',
  DRAFT: 'Abertura pendente',
  ACTIVE: 'Ativa',
  OPEN: 'Aberto',
  CLOSED: 'Encerrado',
  CONFIRMADO: 'Confirmado',
  ESTORNADO: 'Estornado',
};

export const CATEGORY_LABELS: Record<string, string> = {
  MOVEIS_UTENSILIOS: 'Móveis e Utensílios',
  MAQUINAS_EQUIPAMENTOS: 'Máquinas e Equipamentos',
  VEICULOS: 'Veículos',
  INFORMATICA: 'Equipamentos de Informática',
  IMOVEIS: 'Imóveis',
  OUTROS: 'Outros Bens',
};

export const SEGMENT_LABELS: Record<string, string> = {
  COMERCIO: 'Comércio',
  SERVICOS: 'Serviços',
  INDUSTRIA: 'Indústria',
  OUTROS: 'Outros',
};

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  PROFESSOR: 'Professor',
  ALUNO: 'Aluno',
};
