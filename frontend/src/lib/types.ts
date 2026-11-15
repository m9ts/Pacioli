export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'PROFESSOR' | 'ALUNO';
  roleLabel?: string;
}

export interface CompanySummary {
  id: string;
  legalName: string;
  tradeName: string;
  cnpj?: string | null;
  city?: string | null;
  state?: string | null;
  segment: string;
  status: 'DRAFT' | 'ACTIVE';
  initialCapital: string | number;
  openingDate: string;
  openingCompletedAt?: string | null;
  isOwner: boolean;
  accessRole: 'ADMIN' | 'PROFESSOR' | 'ALUNO';
  canWrite: boolean;
  counts?: { accounts: number; entries: number; products: number; assets: number };
}

export interface Account {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  classification: string;
  nature: 'DEVEDORA' | 'CREDORA';
  type: 'SINTETICA' | 'ANALITICA';
  statementGroup?: string | null;
  dreGroup?: string | null;
  referenceCode?: string | null;
  active: boolean;
  parentId?: string | null;
  parent?: { id: string; code: string; name: string } | null;
  hasChildren?: boolean;
  lineCount?: number;
  canDelete?: boolean;
}

export interface JournalLine {
  id: string;
  accountId: string;
  debit: string | number;
  credit: string | number;
  description?: string | null;
  account: { id: string; code: string; name: string };
}

export interface JournalEntry {
  id: string;
  number: number;
  date: string;
  history: string;
  source: string;
  sourceId?: string | null;
  totalDebit: string | number;
  totalCredit: string | number;
  createdBy?: { name: string } | null;
  reversedBy?: { id: string; number: number } | null;
  reversalOf?: { id: string; number: number } | null;
  lines: JournalLine[];
}

export interface Period {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'CLOSED';
  closedAt?: string | null;
  entryCount?: number;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  category: string;
  unit: string;
  quantity: string | number;
  minimumStock: string | number;
  averageCost: string | number;
  salePrice: string | number;
  active: boolean;
  inventoryAccountId: string;
  revenueAccountId?: string | null;
  cmvAccountId?: string | null;
  inventoryAccount?: { code: string; name: string } | null;
}

export interface StockMovement {
  id: string;
  type: string;
  status: string;
  date: string;
  quantity: string | number;
  unitCost: string | number;
  totalValue: string | number;
  balanceAfter: string | number;
  paymentMethod: string;
  documentNumber?: string | null;
  description?: string | null;
  product: { id: string; code: string; name: string; unit: string };
  customer?: { name: string } | null;
  supplier?: { name: string } | null;
  entry?: { id: string; number: number } | null;
  reversalOf?: { id: string } | null;
}

export interface Asset {
  id: string;
  code: string;
  name: string;
  category: string;
  categoryLabel?: string;
  acquisitionDate: string;
  acquisitionValue: string | number;
  usefulLifeMonths: number;
  residualValue: string | number;
  accumulatedDepreciation: string | number;
  bookValue: string | number;
  status: string;
  location?: string | null;
  supplierName?: string | null;
  assetAccount?: { code: string; name: string } | null;
  monthlyDepreciation: number;
}

export interface DashboardData {
  date: string;
  cards: {
    totalAtivo: number;
    totalPassivo: number;
    patrimonioLiquido: number;
    receitaTotal: number;
    despesasTotais: number;
    resultadoExercicio: number;
    estoqueValor: number;
    ativosCount: number;
  };
  dre: Record<string, number>;
  monthly: { month: string; label: string; receita: number; despesas: number; resultado: number }[];
  composition: Record<string, number>;
  stock: {
    totalValue: number;
    productCount: number;
    lowStock: number;
    byCategory: { category: string; value: number }[];
  };
  recentEntries: JournalEntry[];
  recentMovements: StockMovement[];
  openPeriod: Period | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
