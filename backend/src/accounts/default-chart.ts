import {
  AccountClassification,
  AccountNature,
  AccountType,
  DreGroup,
  StatementGroup,
} from '@prisma/client';

export interface DefaultAccount {
  code: string;
  name: string;
  classification: AccountClassification;
  nature: AccountNature;
  type: AccountType;
  parentCode?: string;
  statementGroup?: StatementGroup;
  dreGroup?: DreGroup;
  referenceCode?: string;
  description?: string;
}

const A = AccountClassification.ATIVO;
const P = AccountClassification.PASSIVO;
const PL = AccountClassification.PATRIMONIO_LIQUIDO;
const R = AccountClassification.RECEITA;
const C = AccountClassification.CUSTO;
const D = AccountClassification.DESPESA;

const S = AccountType.SINTETICA;
const An = AccountType.ANALITICA;
const Dev = AccountNature.DEVEDORA;
const Cred = AccountNature.CREDORA;

const AC = StatementGroup.ATIVO_CIRCULANTE;
const ANC = StatementGroup.ATIVO_NAO_CIRCULANTE;
const PC = StatementGroup.PASSIVO_CIRCULANTE;
const PNC = StatementGroup.PASSIVO_NAO_CIRCULANTE;
const PLG = StatementGroup.PATRIMONIO_LIQUIDO;
const RES = StatementGroup.RESULTADO;

/**
 * Plano de contas padrão simplificado, adaptado para fins didáticos.
 * Os `referenceCode` são usados pelas rotinas automáticas de escrituração.
 */
export const DEFAULT_CHART: DefaultAccount[] = [
  // ── ATIVO ────────────────────────────────────────────────
  { code: '1', name: 'ATIVO', classification: A, nature: Dev, type: S },
  { code: '1.1', name: 'ATIVO CIRCULANTE', classification: A, nature: Dev, type: S, parentCode: '1', statementGroup: AC },
  { code: '1.1.1', name: 'DISPONIBILIDADES', classification: A, nature: Dev, type: S, parentCode: '1.1', statementGroup: AC },
  { code: '1.1.1.01', name: 'Caixa', classification: A, nature: Dev, type: An, parentCode: '1.1.1', statementGroup: AC, referenceCode: 'CAIXA', description: 'Dinheiro em poder da empresa e fundo fixo.' },
  { code: '1.1.1.02', name: 'Banco Conta Movimento', classification: A, nature: Dev, type: An, parentCode: '1.1.1', statementGroup: AC, referenceCode: 'BANCO', description: 'Saldos disponíveis em contas bancárias.' },
  { code: '1.1.2', name: 'CONTAS A RECEBER', classification: A, nature: Dev, type: S, parentCode: '1.1', statementGroup: AC },
  { code: '1.1.2.01', name: 'Clientes', classification: A, nature: Dev, type: An, parentCode: '1.1.2', statementGroup: AC, referenceCode: 'CLIENTES', description: 'Vendas a prazo a receber de clientes.' },
  { code: '1.1.2.02', name: 'Adiantamentos a Fornecedores', classification: A, nature: Dev, type: An, parentCode: '1.1.2', statementGroup: AC, referenceCode: 'ADIANTAMENTOS_FORNECEDORES' },
  { code: '1.1.3', name: 'ESTOQUES', classification: A, nature: Dev, type: S, parentCode: '1.1', statementGroup: AC },
  { code: '1.1.3.01', name: 'Mercadorias para Revenda', classification: A, nature: Dev, type: An, parentCode: '1.1.3', statementGroup: AC, referenceCode: 'ESTOQUE', description: 'Estoque avaliado pelo custo médio ponderado móvel.' },
  { code: '1.1.4', name: 'OUTROS CRÉDITOS', classification: A, nature: Dev, type: S, parentCode: '1.1', statementGroup: AC },
  { code: '1.1.4.01', name: 'Impostos a Recuperar', classification: A, nature: Dev, type: An, parentCode: '1.1.4', statementGroup: AC, referenceCode: 'IMPOSTOS_A_RECUPERAR' },

  { code: '1.2', name: 'ATIVO NÃO CIRCULANTE', classification: A, nature: Dev, type: S, parentCode: '1', statementGroup: ANC },
  { code: '1.2.1', name: 'IMOBILIZADO', classification: A, nature: Dev, type: S, parentCode: '1.2', statementGroup: ANC },
  { code: '1.2.1.01', name: 'Móveis e Utensílios', classification: A, nature: Dev, type: An, parentCode: '1.2.1', statementGroup: ANC, referenceCode: 'IMOBILIZADO_MOVEIS' },
  { code: '1.2.1.02', name: 'Máquinas e Equipamentos', classification: A, nature: Dev, type: An, parentCode: '1.2.1', statementGroup: ANC, referenceCode: 'IMOBILIZADO_MAQUINAS' },
  { code: '1.2.1.03', name: 'Veículos', classification: A, nature: Dev, type: An, parentCode: '1.2.1', statementGroup: ANC, referenceCode: 'IMOBILIZADO_VEICULOS' },
  { code: '1.2.1.04', name: 'Equipamentos de Informática', classification: A, nature: Dev, type: An, parentCode: '1.2.1', statementGroup: ANC, referenceCode: 'IMOBILIZADO_INFORMATICA' },
  { code: '1.2.1.05', name: 'Imóveis', classification: A, nature: Dev, type: An, parentCode: '1.2.1', statementGroup: ANC, referenceCode: 'IMOBILIZADO_IMOVEIS' },
  { code: '1.2.1.99', name: 'Outros Bens', classification: A, nature: Dev, type: An, parentCode: '1.2.1', statementGroup: ANC, referenceCode: 'IMOBILIZADO_OUTROS' },
  { code: '1.2.2', name: '(-) DEPRECIAÇÃO ACUMULADA', classification: A, nature: Cred, type: S, parentCode: '1.2', statementGroup: ANC },
  { code: '1.2.2.01', name: 'Depreciação Acumulada de Imobilizado', classification: A, nature: Cred, type: An, parentCode: '1.2.2', statementGroup: ANC, referenceCode: 'DEPRECIACAO_ACUMULADA' },

  // ── PASSIVO ──────────────────────────────────────────────
  { code: '2', name: 'PASSIVO', classification: P, nature: Cred, type: S },
  { code: '2.1', name: 'PASSIVO CIRCULANTE', classification: P, nature: Cred, type: S, parentCode: '2', statementGroup: PC },
  { code: '2.1.1', name: 'FORNECEDORES', classification: P, nature: Cred, type: S, parentCode: '2.1', statementGroup: PC },
  { code: '2.1.1.01', name: 'Fornecedores', classification: P, nature: Cred, type: An, parentCode: '2.1.1', statementGroup: PC, referenceCode: 'FORNECEDORES', description: 'Compras a prazo a pagar a fornecedores.' },
  { code: '2.1.2', name: 'OBRIGAÇÕES TRABALHISTAS E TRIBUTÁRIAS', classification: P, nature: Cred, type: S, parentCode: '2.1', statementGroup: PC },
  { code: '2.1.2.01', name: 'Salários e Encargos a Pagar', classification: P, nature: Cred, type: An, parentCode: '2.1.2', statementGroup: PC, referenceCode: 'SALARIOS_A_PAGAR' },
  { code: '2.1.2.02', name: 'Impostos a Recolher', classification: P, nature: Cred, type: An, parentCode: '2.1.2', statementGroup: PC, referenceCode: 'IMPOSTOS_A_RECOLHER' },
  { code: '2.1.3', name: 'EMPRÉSTIMOS E FINANCIAMENTOS', classification: P, nature: Cred, type: S, parentCode: '2.1', statementGroup: PC },
  { code: '2.1.3.01', name: 'Empréstimos e Financiamentos — Curto Prazo', classification: P, nature: Cred, type: An, parentCode: '2.1.3', statementGroup: PC, referenceCode: 'EMPRESTIMOS_CP' },
  { code: '2.2', name: 'PASSIVO NÃO CIRCULANTE', classification: P, nature: Cred, type: S, parentCode: '2', statementGroup: PNC },
  { code: '2.2.1', name: 'EMPRÉSTIMOS E FINANCIAMENTOS', classification: P, nature: Cred, type: S, parentCode: '2.2', statementGroup: PNC },
  { code: '2.2.1.01', name: 'Empréstimos e Financiamentos — Longo Prazo', classification: P, nature: Cred, type: An, parentCode: '2.2.1', statementGroup: PNC, referenceCode: 'EMPRESTIMOS_LP' },

  // ── PATRIMÔNIO LÍQUIDO ───────────────────────────────────
  { code: '3', name: 'PATRIMÔNIO LÍQUIDO', classification: PL, nature: Cred, type: S },
  { code: '3.1', name: 'CAPITAL SOCIAL', classification: PL, nature: Cred, type: S, parentCode: '3', statementGroup: PLG },
  { code: '3.1.1', name: 'Capital Social Subscrito e Integralizado', classification: PL, nature: Cred, type: An, parentCode: '3.1', statementGroup: PLG, referenceCode: 'CAPITAL_SOCIAL' },
  { code: '3.2', name: 'RESERVAS', classification: PL, nature: Cred, type: S, parentCode: '3', statementGroup: PLG },
  { code: '3.2.1', name: 'Reservas de Lucros', classification: PL, nature: Cred, type: An, parentCode: '3.2', statementGroup: PLG, referenceCode: 'RESERVAS' },
  { code: '3.3', name: 'LUCROS OU PREJUÍZOS ACUMULADOS', classification: PL, nature: Cred, type: S, parentCode: '3', statementGroup: PLG },
  { code: '3.3.1', name: 'Lucros Acumulados', classification: PL, nature: Cred, type: An, parentCode: '3.3', statementGroup: PLG, referenceCode: 'LUCROS_ACUMULADOS' },
  { code: '3.3.2', name: 'Prejuízos Acumulados', classification: PL, nature: Dev, type: An, parentCode: '3.3', statementGroup: PLG, referenceCode: 'PREJUIZOS_ACUMULADOS' },
  { code: '3.4', name: 'RESULTADO DO EXERCÍCIO', classification: PL, nature: Cred, type: S, parentCode: '3', statementGroup: PLG },
  { code: '3.4.1', name: 'Resultado do Exercício', classification: PL, nature: Cred, type: An, parentCode: '3.4', statementGroup: PLG, referenceCode: 'RESULTADO_EXERCICIO' },

  // ── RECEITAS ─────────────────────────────────────────────
  { code: '4', name: 'RECEITAS', classification: R, nature: Cred, type: S, statementGroup: RES },
  { code: '4.1', name: 'RECEITA BRUTA', classification: R, nature: Cred, type: S, parentCode: '4', statementGroup: RES },
  { code: '4.1.1', name: 'Receita de Vendas de Mercadorias', classification: R, nature: Cred, type: An, parentCode: '4.1', statementGroup: RES, dreGroup: DreGroup.RECEITA_BRUTA, referenceCode: 'RECEITA_VENDAS' },
  { code: '4.1.2', name: 'Receita de Serviços Prestados', classification: R, nature: Cred, type: An, parentCode: '4.1', statementGroup: RES, dreGroup: DreGroup.RECEITA_BRUTA, referenceCode: 'RECEITA_SERVICOS' },
  { code: '4.2', name: 'DEDUÇÕES DA RECEITA', classification: R, nature: Dev, type: S, parentCode: '4', statementGroup: RES },
  { code: '4.2.1', name: 'Impostos sobre Vendas', classification: R, nature: Dev, type: An, parentCode: '4.2', statementGroup: RES, dreGroup: DreGroup.DEDUCAO_RECEITA, referenceCode: 'DEDUCAO_IMPOSTOS' },
  { code: '4.2.2', name: 'Devoluções de Vendas', classification: R, nature: Dev, type: An, parentCode: '4.2', statementGroup: RES, dreGroup: DreGroup.DEDUCAO_RECEITA, referenceCode: 'DEDUCAO_DEVOLUCOES' },
  { code: '4.3', name: 'RECEITAS FINANCEIRAS', classification: R, nature: Cred, type: S, parentCode: '4', statementGroup: RES },
  { code: '4.3.1', name: 'Juros e Rendimentos Financeiros', classification: R, nature: Cred, type: An, parentCode: '4.3', statementGroup: RES, dreGroup: DreGroup.RECEITA_FINANCEIRA, referenceCode: 'RECEITAS_FINANCEIRAS' },
  { code: '4.4', name: 'OUTRAS RECEITAS', classification: R, nature: Cred, type: S, parentCode: '4', statementGroup: RES },
  { code: '4.4.1', name: 'Ganho na Venda de Ativos', classification: R, nature: Cred, type: An, parentCode: '4.4', statementGroup: RES, dreGroup: DreGroup.OUTRAS_RECEITAS, referenceCode: 'GANHO_VENDA_ATIVO' },
  { code: '4.4.2', name: 'Ajustes Positivos de Estoque', classification: R, nature: Cred, type: An, parentCode: '4.4', statementGroup: RES, dreGroup: DreGroup.OUTRAS_RECEITAS, referenceCode: 'AJUSTE_ESTOQUE' },

  // ── CUSTOS ──────────────────────────────────────────────
  { code: '5', name: 'CUSTOS', classification: C, nature: Dev, type: S, statementGroup: RES },
  { code: '5.1', name: 'CUSTO DAS MERCADORIAS VENDIDAS', classification: C, nature: Dev, type: S, parentCode: '5', statementGroup: RES },
  { code: '5.1.1', name: 'CMV — Custo das Mercadorias Vendidas', classification: C, nature: Dev, type: An, parentCode: '5.1', statementGroup: RES, dreGroup: DreGroup.CMV, referenceCode: 'CMV' },

  // ── DESPESAS ────────────────────────────────────────────
  { code: '6', name: 'DESPESAS', classification: D, nature: Dev, type: S, statementGroup: RES },
  { code: '6.1', name: 'DESPESAS ADMINISTRATIVAS', classification: D, nature: Dev, type: S, parentCode: '6', statementGroup: RES },
  { code: '6.1.1', name: 'Salários e Encargos', classification: D, nature: Dev, type: An, parentCode: '6.1', statementGroup: RES, dreGroup: DreGroup.DESPESA_ADMINISTRATIVA, referenceCode: 'DESPESA_SALARIOS' },
  { code: '6.1.2', name: 'Aluguéis', classification: D, nature: Dev, type: An, parentCode: '6.1', statementGroup: RES, dreGroup: DreGroup.DESPESA_ADMINISTRATIVA, referenceCode: 'DESPESA_ALUGUEL' },
  { code: '6.1.3', name: 'Energia, Água e Telefone', classification: D, nature: Dev, type: An, parentCode: '6.1', statementGroup: RES, dreGroup: DreGroup.DESPESA_ADMINISTRATIVA, referenceCode: 'DESPESA_UTILIDADES' },
  { code: '6.1.4', name: 'Materiais de Escritório', classification: D, nature: Dev, type: An, parentCode: '6.1', statementGroup: RES, dreGroup: DreGroup.DESPESA_ADMINISTRATIVA, referenceCode: 'DESPESA_MATERIAL' },
  { code: '6.1.5', name: 'Serviços de Terceiros', classification: D, nature: Dev, type: An, parentCode: '6.1', statementGroup: RES, dreGroup: DreGroup.DESPESA_ADMINISTRATIVA, referenceCode: 'DESPESA_SERVICOS' },
  { code: '6.2', name: 'DESPESAS COM VENDAS', classification: D, nature: Dev, type: S, parentCode: '6', statementGroup: RES },
  { code: '6.2.1', name: 'Marketing e Publicidade', classification: D, nature: Dev, type: An, parentCode: '6.2', statementGroup: RES, dreGroup: DreGroup.DESPESA_VENDAS, referenceCode: 'DESPESA_MARKETING' },
  { code: '6.2.2', name: 'Comissões sobre Vendas', classification: D, nature: Dev, type: An, parentCode: '6.2', statementGroup: RES, dreGroup: DreGroup.DESPESA_VENDAS, referenceCode: 'DESPESA_COMISSOES' },
  { code: '6.3', name: 'DESPESAS FINANCEIRAS', classification: D, nature: Dev, type: S, parentCode: '6', statementGroup: RES },
  { code: '6.3.1', name: 'Juros e Tarifas Bancárias', classification: D, nature: Dev, type: An, parentCode: '6.3', statementGroup: RES, dreGroup: DreGroup.DESPESA_FINANCEIRA, referenceCode: 'DESPESA_FINANCEIRA' },
  { code: '6.4', name: 'DESPESA COM DEPRECIAÇÃO', classification: D, nature: Dev, type: S, parentCode: '6', statementGroup: RES },
  { code: '6.4.1', name: 'Depreciação de Imobilizado', classification: D, nature: Dev, type: An, parentCode: '6.4', statementGroup: RES, dreGroup: DreGroup.DESPESA_ADMINISTRATIVA, referenceCode: 'DESPESA_DEPRECIACAO' },
  { code: '6.5', name: 'OUTRAS DESPESAS', classification: D, nature: Dev, type: S, parentCode: '6', statementGroup: RES },
  { code: '6.5.1', name: 'Perda na Baixa de Ativos', classification: D, nature: Dev, type: An, parentCode: '6.5', statementGroup: RES, dreGroup: DreGroup.OUTRAS_DESPESAS, referenceCode: 'PERDA_BAIXA_ATIVO' },
  { code: '6.5.2', name: 'Perdas e Ajustes Negativos de Estoque', classification: D, nature: Dev, type: An, parentCode: '6.5', statementGroup: RES, dreGroup: DreGroup.OUTRAS_DESPESAS, referenceCode: 'PERDA_ESTOQUE' },
];

/** Mapeamento categoria de ativo → código de referência da conta do imobilizado. */
export const ASSET_CATEGORY_ACCOUNT: Record<string, string> = {
  MOVEIS_UTENSILIOS: 'IMOBILIZADO_MOVEIS',
  MAQUINAS_EQUIPAMENTOS: 'IMOBILIZADO_MAQUINAS',
  VEICULOS: 'IMOBILIZADO_VEICULOS',
  INFORMATICA: 'IMOBILIZADO_INFORMATICA',
  IMOVEIS: 'IMOBILIZADO_IMOVEIS',
  OUTROS: 'IMOBILIZADO_OUTROS',
};
