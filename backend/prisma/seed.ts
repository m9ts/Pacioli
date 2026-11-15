/* Seed do banco — Pacioli: Simulador Educacional de Contabilidade
 * Cria perfis, usuários de demonstração e uma empresa exemplo completa:
 * abertura com capital e patrimônio, plano de contas, produtos, compras,
 * vendas, despesas, ativos e depreciação — tudo com lançamentos reais.
 */
import { Prisma, PrismaClient, JournalSource, PaymentMethod, StockMovementType, CompanySegment } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DEFAULT_CHART } from '../src/accounts/default-chart';

const prisma = new PrismaClient();
const YEAR = new Date().getUTCFullYear();

type Tx = Prisma.TransactionClient;

const money = (value: number) => value.toFixed(2);

async function accountRef(tx: Tx, companyId: string, referenceCode: string) {
  const account = await tx.account.findFirst({ where: { companyId, referenceCode } });
  if (!account) throw new Error(`Conta de referência ${referenceCode} não encontrada no plano.`);
  return account;
}

async function findPeriod(tx: Tx, companyId: string, date: Date) {
  const period = await tx.accountingPeriod.findFirst({
    where: { companyId, startDate: { lte: date }, endDate: { gte: date } },
  });
  if (!period) throw new Error(`Nenhum período cobre ${date.toISOString().slice(0, 10)}`);
  return period;
}

async function postEntry(
  tx: Tx,
  params: {
    companyId: string;
    date: Date;
    history: string;
    source: JournalSource;
    sourceId?: string;
    createdById?: string;
    lines: { accountId?: string; accountRef?: string; debit?: number; credit?: number; description?: string }[];
  },
) {
  const resolved = [] as { accountId: string; debit: number; credit: number; description?: string; position: number }[];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const [index, line] of params.lines.entries()) {
    let account = line.accountId
      ? await tx.account.findFirst({ where: { id: line.accountId, companyId: params.companyId } })
      : line.accountRef
        ? await accountRef(tx, params.companyId, line.accountRef)
        : null;
    if (!account) throw new Error(`Conta inválida no lançamento "${params.history}".`);
    if (account.type !== 'ANALITICA') throw new Error(`Conta ${account.code} não é analítica.`);
    const debit = Number((line.debit ?? 0).toFixed(2));
    const credit = Number((line.credit ?? 0).toFixed(2));
    totalDebit += debit;
    totalCredit += credit;
    resolved.push({ accountId: account.id, debit, credit, description: line.description, position: index });
  }

  totalDebit = Number(totalDebit.toFixed(2));
  totalCredit = Number(totalCredit.toFixed(2));
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(
      `Partidas dobradas desequilibradas no lançamento "${params.history}": D ${totalDebit} x C ${totalCredit}`,
    );
  }

  const period = await findPeriod(tx, params.companyId, params.date);
  const aggregate = await tx.journalEntry.aggregate({
    where: { companyId: params.companyId },
    _max: { number: true },
  });

  return tx.journalEntry.create({
    data: {
      companyId: params.companyId,
      periodId: period.id,
      number: (aggregate._max.number ?? 0) + 1,
      date: params.date,
      history: params.history,
      source: params.source,
      sourceId: params.sourceId,
      createdById: params.createdById,
      totalDebit,
      totalCredit,
      lines: { create: resolved },
    },
  });
}

async function buildChart(companyId: string, tx: Tx) {
  const idByCode = new Map<string, string>();
  for (const account of DEFAULT_CHART) {
    const created = await tx.account.create({
      data: {
        companyId,
        code: account.code,
        name: account.name,
        description: account.description,
        classification: account.classification,
        nature: account.nature,
        type: account.type,
        statementGroup: account.statementGroup,
        dreGroup: account.dreGroup,
        referenceCode: account.referenceCode,
        isSystem: Boolean(account.referenceCode),
        parentId: account.parentCode ? idByCode.get(account.parentCode) : null,
      },
    });
    idByCode.set(account.code, created.id);
  }
}

const date = (month: number, day: number) => new Date(Date.UTC(YEAR, month - 1, day));

async function seedMovement(
  tx: Tx,
  params: {
    companyId: string;
    createdById: string;
    type: 'COMPRA' | 'VENDA';
    productId: string;
    date: Date;
    quantity: number;
    unitValue: number;
    paymentMethod: PaymentMethod;
    customerId?: string;
    supplierId?: string;
    documentNumber?: string;
  },
) {
  const product = await tx.product.findUnique({ where: { id: params.productId } });
  if (!product) throw new Error('Produto não encontrado no seed.');

  const qty = params.quantity;
  const totalValue = Number((qty * params.unitValue).toFixed(2));
  const paymentRef =
    params.paymentMethod === 'DINHEIRO'
      ? 'CAIXA'
      : params.paymentMethod === 'BANCO'
        ? 'BANCO'
        : params.type === 'COMPRA'
          ? 'FORNECEDORES'
          : 'CLIENTES';

  let newQty: number;
  let newAvg: number;

  if (params.type === 'COMPRA') {
    newQty = Number(product.quantity) + qty;
    newAvg =
      Number(product.quantity) === 0
        ? Number((totalValue / qty).toFixed(4))
        : Number(
            ((Number(product.quantity) * Number(product.averageCost) + totalValue) / newQty).toFixed(4),
          );

    const entry = await postEntry(tx, {
      companyId: params.companyId,
      date: params.date,
      history: `Compra de mercadorias: ${qty} ${product.unit} de ${product.name}`,
      source: JournalSource.COMPRA,
      sourceId: product.id,
      createdById: params.createdById,
      lines: [
        { accountRef: 'ESTOQUE', debit: totalValue, description: 'Entrada de mercadorias' },
        { accountRef: paymentRef, credit: totalValue, description: 'Contrapartida da compra' },
      ],
    });

    const movement = await tx.stockMovement.create({
      data: {
        companyId: params.companyId,
        productId: product.id,
        type: StockMovementType.COMPRA,
        date: params.date,
        quantity: qty,
        unitCost: Number((totalValue / qty).toFixed(4)),
        totalValue,
        balanceAfter: newQty,
        paymentMethod: params.paymentMethod,
        documentNumber: params.documentNumber,
        supplierId: params.supplierId,
        createdById: params.createdById,
      },
    });
    await tx.stockMovement.update({
      where: { id: movement.id },
      data: { journalEntryId: entry.id },
    });
  } else {
    const cogs = Number((qty * Number(product.averageCost)).toFixed(2));
    newQty = Number(product.quantity) - qty;
    newAvg = Number(product.averageCost);
    if (newQty < 0) throw new Error(`Estoque insuficiente no seed para ${product.name}.`);

    const revenueEntry = await postEntry(tx, {
      companyId: params.companyId,
      date: params.date,
      history: `Venda de mercadorias: ${qty} ${product.unit} de ${product.name}`,
      source: JournalSource.VENDA,
      sourceId: product.id,
      createdById: params.createdById,
      lines: [
        { accountRef: paymentRef, debit: totalValue, description: 'Recebimento da venda' },
        { accountRef: 'RECEITA_VENDAS', credit: totalValue, description: 'Receita de venda' },
      ],
    });

    const cmvEntry = await postEntry(tx, {
      companyId: params.companyId,
      date: params.date,
      history: `CMV: ${qty} ${product.unit} de ${product.name}`,
      source: JournalSource.VENDA,
      sourceId: product.id,
      createdById: params.createdById,
      lines: [
        { accountRef: 'CMV', debit: cogs, description: 'Custo das mercadorias vendidas' },
        { accountRef: 'ESTOQUE', credit: cogs, description: 'Baixa de estoque' },
      ],
    });

    const movement = await tx.stockMovement.create({
      data: {
        companyId: params.companyId,
        productId: product.id,
        type: StockMovementType.VENDA,
        date: params.date,
        quantity: qty,
        unitCost: Number(product.averageCost),
        totalValue,
        balanceAfter: newQty,
        paymentMethod: params.paymentMethod,
        documentNumber: params.documentNumber,
        customerId: params.customerId,
        createdById: params.createdById,
      },
    });
    await tx.stockMovement.update({
      where: { id: movement.id },
      data: { journalEntryId: revenueEntry.id },
    });
    void cmvEntry;
  }

  await tx.product.update({
    where: { id: product.id },
    data: { quantity: newQty, averageCost: newAvg },
  });
}

async function main() {
  console.log('🌱 Executando seed do Pacioli...');

  const [adminRole, professorRole, studentRole] = await Promise.all(
    [
      { name: 'ADMIN' as const, label: 'Administrador', description: 'Gerencia o sistema e todas as empresas.' },
      { name: 'PROFESSOR' as const, label: 'Professor', description: 'Consulta as empresas vinculadas às atividades.' },
      { name: 'ALUNO' as const, label: 'Aluno', description: 'Gerencia as próprias empresas simuladas.' },
    ].map((role) =>
      prisma.role.upsert({
        where: { name: role.name },
        update: { label: role.label, description: role.description },
        create: role,
      }),
    ),
  );

  const password = await bcrypt.hash('pacioli123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@pacioli.dev' },
    update: {},
    create: {
      name: 'Administrador Pacioli',
      email: 'admin@pacioli.dev',
      passwordHash: password,
      roleId: adminRole.id,
    },
  });

  const teacher = await prisma.user.upsert({
    where: { email: 'professor@pacioli.dev' },
    update: {},
    create: {
      name: 'Prof. Helena Martins',
      email: 'professor@pacioli.dev',
      passwordHash: password,
      roleId: professorRole.id,
    },
  });

  const student = await prisma.user.upsert({
    where: { email: 'aluno@pacioli.dev' },
    update: {},
    create: {
      name: 'Ana Souza',
      email: 'aluno@pacioli.dev',
      passwordHash: password,
      roleId: studentRole.id,
    },
  });

  const existingDemo = await prisma.company.findFirst({
    where: { tradeName: 'Padaria Pão Dourado (demo)' },
  });
  if (existingDemo) {
    console.log('✔ Empresa demonstrativa já existe — seed concluído.');
    return;
  }

  const company = await prisma.company.create({
    data: {
      ownerId: student.id,
      legalName: 'Padaria Pão Dourado Ltda. (demo)',
      tradeName: 'Padaria Pão Dourado (demo)',
      cnpj: '12345678000199',
      street: 'Rua das Flores',
      number: '120',
      district: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      phone: '(11) 4002-8922',
      email: 'contato@paodourado.demo',
      segment: CompanySegment.COMERCIO,
      activity: 'Comércio varejista de alimentos',
      openingDate: date(1, 1),
      responsibleName: 'Ana Souza',
      initialCapital: 60000,
      status: 'ACTIVE',
      openingCompletedAt: new Date(),
      members: {
        create: [
          { userId: student.id, roleId: studentRole.id },
          { userId: teacher.id, roleId: professorRole.id },
        ],
      },
    },
  });
  const companyId = company.id;
  console.log('  → Empresa:', company.tradeName);

  // Timeout maior: o seed executa centenas de comandos; o padrão do Prisma
  // (5s) é insuficiente contra bancos remotos (ex.: Neon) por causa da latência.
  await prisma.$transaction(
    async (tx) => {
    // Plano de contas padrão
    await buildChart(companyId, tx);

    // Período contábil do exercício
    const period = await tx.accountingPeriod.create({
      data: {
        companyId,
        name: `Exercício ${YEAR}`,
        startDate: date(1, 1),
        endDate: new Date(Date.UTC(YEAR, 11, 31, 23, 59, 59, 999)),
        status: 'OPEN',
      },
    });
    void period;

    // ── Abertura ───────────────────────────────────────────
    const capitalAccount = await accountRef(tx, companyId, 'CAPITAL_SOCIAL');
    const caixa = await accountRef(tx, companyId, 'CAIXA');
    const moveis = await accountRef(tx, companyId, 'IMOBILIZADO_MOVEIS');
    const fornecedores = await accountRef(tx, companyId, 'FORNECEDORES');

    await postEntry(tx, {
      companyId,
      date: date(1, 1),
      history: `Integralização do capital social — Exercício ${YEAR}`,
      source: JournalSource.ABERTURA,
      sourceId: 'CAPITAL_SOCIAL',
      createdById: student.id,
      lines: [
        { accountId: caixa.id, debit: 60000, description: 'Ingresso do capital social' },
        { accountId: capitalAccount.id, credit: 60000, description: 'Capital social integralizado' },
      ],
    });

    await postEntry(tx, {
      companyId,
      date: date(1, 1),
      history: 'Registro do patrimônio inicial — bens, direitos e obrigações',
      source: JournalSource.ABERTURA,
      sourceId: 'PATRIMONIO_INICIAL',
      createdById: student.id,
      lines: [
        { accountId: moveis.id, debit: 8000, description: 'Móveis e utensílios da padaria' },
        { accountId: fornecedores.id, credit: 2000, description: 'Compra a prazo de móveis' },
        { accountId: caixa.id, credit: 6000, description: 'Pagamento do patrimônio inicial com recursos do capital' },
      ],
    });

    // ── Clientes e fornecedores ───────────────────────────
    const customerA = await tx.customer.create({
      data: { companyId, name: 'Mercado Bom Preço', document: '98765432000155' },
    });
    const customerB = await tx.customer.create({
      data: { companyId, name: 'Cantina Dona Maria', document: '45678912000133' },
    });
    const supplierA = await tx.supplier.create({
      data: { companyId, name: 'Moinho Regional S.A.', document: '11223344000166' },
    });
    const supplierB = await tx.supplier.create({
      data: { companyId, name: 'Distribuidora Doce Lar', document: '55667788000111' },
    });
    void customerB;
    void supplierB;

    // ── Produtos ──────────────────────────────────────────
    const inventory = await accountRef(tx, companyId, 'ESTOQUE');
    const revenue = await accountRef(tx, companyId, 'RECEITA_VENDAS');
    const cmv = await accountRef(tx, companyId, 'CMV');

    const products = [] as string[];
    for (const product of [
      { code: 'PRD-001', name: 'Farinha de Trigo 1kg', category: 'Alimentos', unit: 'KG', salePrice: 6, minimumStock: 20 },
      { code: 'PRD-002', name: 'Chocolate em Pó 400g', category: 'Alimentos', unit: 'UN', salePrice: 25, minimumStock: 10 },
      { code: 'PRD-003', name: 'Óleo de Soja 900ml', category: 'Alimentos', unit: 'UN', salePrice: 10, minimumStock: 12 },
    ]) {
      const created = await tx.product.create({
        data: {
          companyId,
          code: product.code,
          name: product.name,
          category: product.category,
          unit: product.unit,
          salePrice: product.salePrice,
          minimumStock: product.minimumStock,
          inventoryAccountId: inventory.id,
          revenueAccountId: revenue.id,
          cmvAccountId: cmv.id,
        },
      });
      products.push(created.id);
    }

    // ── Ativos ────────────────────────────────────────────
    const assetDefs = [
      {
        code: 'ATV-001',
        name: 'Fogão Industrial 6 bocas',
        category: 'MAQUINAS_EQUIPAMENTOS' as const,
        value: 12000,
        method: 'A_VISTA' as const,
        payment: (PaymentMethod.DINHEIRO as PaymentMethod),
        life: 120,
        residual: 0,
        supplierId: supplierB.id,
      },
      {
        code: 'ATV-002',
        name: 'Câmara Fria para Pães',
        category: 'MAQUINAS_EQUIPAMENTOS' as const,
        value: 6000,
        method: 'A_PRAZO' as const,
        payment: (PaymentMethod.A_PRAZO as PaymentMethod),
        life: 96,
        residual: 0,
        supplierId: supplierB.id,
      },
      {
        code: 'ATV-003',
        name: 'Notebook de Gestão',
        category: 'INFORMATICA' as const,
        value: 3500,
        method: 'A_VISTA' as const,
        payment: (PaymentMethod.DINHEIRO as PaymentMethod),
        life: 48,
        residual: 200,
        supplierId: supplierA.id,
      },
    ];

    for (const def of assetDefs) {
      const assetAccount = await tx.account.findFirst({
        where: {
          companyId,
          referenceCode:
            def.category === 'MAQUINAS_EQUIPAMENTOS'
              ? 'IMOBILIZADO_MAQUINAS'
              : 'IMOBILIZADO_INFORMATICA',
        },
      });
      if (!assetAccount) throw new Error('Conta do imobilizado não encontrada.');
      const creditRef =
        def.method === 'A_VISTA'
          ? (def.payment === PaymentMethod.BANCO ? 'BANCO' : 'CAIXA')
          : def.method === 'A_PRAZO'
            ? 'FORNECEDORES'
            : 'EMPRESTIMOS_LP';

      const created = await tx.asset.create({
        data: {
          companyId,
          code: def.code,
          name: def.name,
          category: def.category,
          acquisitionDate: date(1, 5),
          acquisitionValue: def.value,
          supplierId: def.supplierId,
          location: 'Loja — Centro',
          assetAccountId: assetAccount.id,
          depreciationAccountId: (await accountRef(tx, companyId, 'DEPRECIACAO_ACUMULADA')).id,
          depreciationExpenseAccountId: (await accountRef(tx, companyId, 'DESPESA_DEPRECIACAO')).id,
          acquisitionMethod: def.method,
          usefulLifeMonths: def.life,
          residualValue: def.residual,
        },
      });

      await postEntry(tx, {
        companyId,
        date: date(1, 5),
        history: `Aquisição de ativo: ${def.name} (${def.code})`,
        source: JournalSource.AQUISICAO_ATIVO,
        sourceId: created.id,
        createdById: student.id,
        lines: [
          { accountId: assetAccount.id, debit: def.value, description: def.name },
          { accountRef: creditRef, credit: def.value, description: 'Contrapartida da aquisição' },
        ],
      });
    }

    // ── Movimentações de estoque ──────────────────────────
    const movements = [
      { month: 1, day: 10, type: 'COMPRA' as const, product: 0, qty: 100, unit: 4, payment: PaymentMethod.A_PRAZO, supplier: supplierA.id, doc: 'NF-1001' },
      { month: 1, day: 12, type: 'COMPRA' as const, product: 1, qty: 30, unit: 18, payment: PaymentMethod.DINHEIRO, doc: 'NF-1002' },
      { month: 1, day: 15, type: 'COMPRA' as const, product: 2, qty: 50, unit: 7, payment: PaymentMethod.DINHEIRO, doc: 'NF-1003' },
      { month: 1, day: 20, type: 'VENDA' as const, product: 0, qty: 60, unit: 6, payment: PaymentMethod.A_PRAZO, customer: customerA.id, doc: 'PV-201' },
      { month: 1, day: 22, type: 'VENDA' as const, product: 1, qty: 20, unit: 25, payment: PaymentMethod.DINHEIRO, doc: 'PV-202' },
      { month: 1, day: 28, type: 'VENDA' as const, product: 2, qty: 30, unit: 10, payment: PaymentMethod.BANCO, doc: 'PV-203' },
      { month: 2, day: 8, type: 'COMPRA' as const, product: 0, qty: 80, unit: 4.5, payment: PaymentMethod.A_PRAZO, supplier: supplierA.id, doc: 'NF-1004' },
      { month: 2, day: 15, type: 'VENDA' as const, product: 0, qty: 70, unit: 6.5, payment: PaymentMethod.A_PRAZO, customer: customerB.id, doc: 'PV-204' },
      { month: 2, day: 18, type: 'COMPRA' as const, product: 2, qty: 40, unit: 7.2, payment: PaymentMethod.DINHEIRO, doc: 'NF-1005' },
      { month: 2, day: 25, type: 'VENDA' as const, product: 2, qty: 35, unit: 10.5, payment: PaymentMethod.DINHEIRO, doc: 'PV-205' },
      { month: 3, day: 10, type: 'VENDA' as const, product: 0, qty: 40, unit: 6.8, payment: PaymentMethod.BANCO, doc: 'PV-206' },
      { month: 3, day: 12, type: 'VENDA' as const, product: 1, qty: 8, unit: 26, payment: PaymentMethod.DINHEIRO, doc: 'PV-207' },
    ];

    for (const movement of movements) {
      await seedMovement(tx, {
        companyId,
        createdById: student.id,
        type: movement.type,
        productId: products[movement.product],
        date: date(movement.month, movement.day),
        quantity: movement.qty,
        unitValue: movement.unit,
        paymentMethod: movement.payment,
        customerId: (movement as any).customer,
        supplierId: (movement as any).supplier,
        documentNumber: movement.doc,
      });
    }

    // ── Despesas mensais (jan e fev) ──────────────────────
    for (const month of [1, 2]) {
      await postEntry(tx, {
        companyId,
        date: date(month, 5),
        history: `Aluguel da loja — ${month}/${YEAR}`,
        source: JournalSource.MANUAL,
        createdById: student.id,
        lines: [
          { accountRef: 'DESPESA_ALUGUEL', debit: 2000, description: 'Aluguel mensal' },
          { accountRef: 'CAIXA', credit: 2000, description: 'Pagamento do aluguel' },
        ],
      });
      await postEntry(tx, {
        companyId,
        date: date(month, 10),
        history: `Energia, água e telefone — ${month}/${YEAR}`,
        source: JournalSource.MANUAL,
        createdById: student.id,
        lines: [
          { accountRef: 'DESPESA_UTILIDADES', debit: 320, description: 'Contas de consumo' },
          { accountRef: 'BANCO', credit: 320, description: 'Débito em conta' },
        ],
      });
      await postEntry(tx, {
        companyId,
        date: date(month, 28),
        history: `Salários e encargos — ${month}/${YEAR}`,
        source: JournalSource.MANUAL,
        createdById: student.id,
        lines: [
          { accountRef: 'DESPESA_SALARIOS', debit: 3500, description: 'Folha de pagamento' },
          { accountRef: 'BANCO', credit: 3500, description: 'Pagamento da folha' },
        ],
      });
    }

    // ── Depreciação (jan e fev) ───────────────────────────
    const expenseAccount = await accountRef(tx, companyId, 'DESPESA_DEPRECIACAO');
    const accumulatedAccount = await accountRef(tx, companyId, 'DEPRECIACAO_ACUMULADA');
    const assets = await tx.asset.findMany({ where: { companyId } });

    for (const month of [1, 2]) {
      for (const asset of assets) {
        const monthly = Number(
          ((Number(asset.acquisitionValue) - Number(asset.residualValue)) / asset.usefulLifeMonths).toFixed(2),
        );
        if (monthly <= 0) continue;
        const newAccumulated = Number(asset.accumulatedDepreciation) + monthly;
        const base = Number(asset.acquisitionValue) - Number(asset.residualValue);
        if (newAccumulated > base + 0.001) continue;

        const entry = await postEntry(tx, {
          companyId,
          date: date(month, 28),
          history: `Depreciação mensal de ${asset.name} (${asset.code}) — ${String(month).padStart(2, '0')}/${YEAR}`,
          source: JournalSource.DEPRECIACAO,
          sourceId: asset.id,
          createdById: student.id,
          lines: [
            { accountId: expenseAccount.id, debit: monthly, description: 'Despesa com depreciação' },
            { accountId: accumulatedAccount.id, credit: monthly, description: 'Depreciação acumulada' },
          ],
        });

        await tx.asset.update({
          where: { id: asset.id },
          data: { accumulatedDepreciation: newAccumulated },
        });
        await tx.depreciationRecord.create({
          data: {
            companyId,
            assetId: asset.id,
            referenceYear: YEAR,
            referenceMonth: month,
            date: date(month, 28),
            openingValue: Number(asset.acquisitionValue),
            depreciationAmount: monthly,
            accumulatedDepreciation: newAccumulated,
            bookValue: Number(asset.acquisitionValue) - newAccumulated,
            status: 'CONTABILIZADO',
            journalEntryId: entry.id,
          },
        });
      }
    }

    await tx.company.update({
      where: { id: companyId },
      data: { initialCapital: 60000 },
    });
  }, { timeout: 60_000, maxWait: 10_000 });

  console.log('✔ Seed concluído: empresa demonstrativa com escrituração real.');
  console.log('  Logins: admin@pacioli.dev / professor@pacioli.dev / aluno@pacioli.dev (senha: pacioli123)');
}

main()
  .catch((error) => {
    console.error('Erro no seed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
