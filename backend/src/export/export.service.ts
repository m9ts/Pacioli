import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PdfPrinterDefault from 'pdfmake';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { JournalService } from '../journal/journal.service';
import { AssetsService } from '../assets/assets.service';
import { ProductsService } from '../stock/products.service';
import { brl, formatDateTimeBR, formatIsoDateBR } from './format';

const PdfPrinter: any = (PdfPrinterDefault as any).default ?? PdfPrinterDefault;

const SOURCE_LABELS: Record<string, string> = {
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

export interface ExportFilters {
  from?: string;
  to?: string;
  date?: string;
  periodId?: string;
  accountId?: string;
  compare?: boolean;
}

interface Table {
  title?: string;
  columns: { header: string; width?: number | string; align?: 'left' | 'right' | 'center' }[];
  rows: (string | number | null)[][];
  footer?: (string | number | null)[] | null;
}

const NAVY = '12304F';
const LIGHT = 'EEF2F7';

@Injectable()
export class ExportService {
  private printer: any;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly journal: JournalService,
    private readonly assets: AssetsService,
    private readonly products: ProductsService,
  ) {
    this.printer = new (PdfPrinter as any)({
      Roboto: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
      },
    });
  }

  private async company(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        legalName: true,
        tradeName: true,
        cnpj: true,
        city: true,
        state: true,
      },
    });
    if (!company) throw new BadRequestException('Empresa não encontrada.');
    return company;
  }

  private titleLine(company: any, title: string, subtitle?: string) {
    return [`${company.legalName} — ${company.tradeName}`, title, subtitle].filter(Boolean) as string[];
  }

  // ──────────────────────────────────────────────
  // Excel
  // ──────────────────────────────────────────────
  private async buildWorkbook(
    company: any,
    title: string,
    subtitle: string,
    tables: Table[],
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Pacioli — Simulador Educacional de Contabilidade';
    workbook.created = new Date();

    for (const table of tables) {
      const sheet = workbook.addWorksheet(table.title?.slice(0, 30) ?? title.slice(0, 30));
      let rowIndex = 1;

      sheet.mergeCells(1, 1, 1, Math.max(2, table.columns.length));
      const companyCell = sheet.getCell(1, 1);
      companyCell.value = `${company.legalName} — ${company.tradeName}`;
      companyCell.font = { bold: true, size: 12, color: { argb: NAVY } };
      rowIndex++;

      sheet.mergeCells(rowIndex, 1, rowIndex, Math.max(2, table.columns.length));
      const titleCell = sheet.getCell(rowIndex, 1);
      titleCell.value = title;
      titleCell.font = { bold: true, size: 14 };
      rowIndex++;

      if (subtitle) {
        sheet.mergeCells(rowIndex, 1, rowIndex, Math.max(2, table.columns.length));
        const subtitleCell = sheet.getCell(rowIndex, 1);
        subtitleCell.value = subtitle;
        subtitleCell.font = { italic: true, size: 10, color: { argb: '555555' } };
        rowIndex++;
      }

      const generated = sheet.getCell(rowIndex, 1);
      generated.value = `Gerado em ${formatDateTimeBR(new Date())} pelo sistema Pacioli`;
      generated.font = { italic: true, size: 9, color: { argb: '777777' } };
      rowIndex += 2;

      const headerRow = sheet.getRow(rowIndex);
      table.columns.forEach((column, index) => {
        const cell = headerRow.getCell(index + 1);
        cell.value = column.header;
        cell.font = { bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        cell.alignment = { horizontal: column.align === 'right' ? 'right' : 'left' };
        sheet.getColumn(index + 1).width =
          typeof column.width === 'number' ? column.width : Math.max(12, column.header.length + 4);
      });
      headerRow.commit();
      rowIndex++;

      for (const row of table.rows) {
        const excelRow = sheet.getRow(rowIndex);
        row.forEach((value, index) => {
          const cell = excelRow.getCell(index + 1);
          if (typeof value === 'number') {
            cell.value = value;
            cell.numFmt = '#,##0.00';
            cell.alignment = { horizontal: 'right' };
          } else {
            cell.value = value ?? '';
          }
        });
        excelRow.commit();
        rowIndex++;
      }

      if (table.footer) {
        const footerRow = sheet.getRow(rowIndex);
        table.footer.forEach((value, index) => {
          const cell = footerRow.getCell(index + 1);
          if (typeof value === 'number') {
            cell.value = value;
            cell.numFmt = '#,##0.00';
            cell.alignment = { horizontal: 'right' };
          } else {
            cell.value = value ?? '';
          }
          cell.font = { bold: true };
          cell.border = { top: { style: 'thin' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
        });
        footerRow.commit();
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer);
  }

  // ──────────────────────────────────────────────
  // PDF
  // ──────────────────────────────────────────────
  // pdfmake 0.2 keeps non-numeric string widths as strings in column math
  // (producing NaN and crashing pdfkit), so every width is normalized here.
  // Integer values >= 10 are treated as absolute points ('36' → 36pt);
  // fractional values < 10 were authored as relative weights (e.g. '3.2',
  // '1.1') and are converted to '%' of the width left after absolute columns.
  private resolvePdfWidths(columns: Table['columns']): (number | string)[] {
    // A4 (pdfmake default page) with default 40pt margins on each side.
    const CONTENT_WIDTH = 595.28 - 80;

    const parsed = columns.map((column) => {
      const width = column.width as number | string | null | undefined;
      if (width == null || width === '*' || width === 'star' || width === 'auto') return width as string;
      if (typeof width === 'string' && width.endsWith('%')) return width;
      const numeric = typeof width === 'number' ? width : parseFloat(width);
      return Number.isFinite(numeric) ? numeric : '*';
    });

    const absoluteSum = parsed.reduce<number>(
      (sum, width) => sum + (typeof width === 'number' && width >= 10 ? width : 0),
      0,
    );
    const weightSum = parsed.reduce<number>(
      (sum, width) => sum + (typeof width === 'number' && width < 10 ? width : 0),
      0,
    );

    if (weightSum > 0 && absoluteSum < CONTENT_WIDTH) {
      const budgetPct = ((CONTENT_WIDTH - absoluteSum) / CONTENT_WIDTH) * 100;
      return parsed.map((width) => {
        if (typeof width !== 'number') return width;
        if (width < 10) return `${((width / weightSum) * budgetPct).toFixed(4)}%`;
        return width;
      });
    }

    // Weights can't be honored (or there are none) — fall back to star for
    // small values so the table still fits the page.
    return parsed.map((width) => (typeof width === 'number' && width < 10 ? '*' : width));
  }

  private async buildPdf(
    company: any,
    title: string,
    subtitle: string,
    tables: Table[],
  ): Promise<Buffer> {
    const content: any[] = [
      {
        text: company.legalName,
        style: 'company',
      },
      {
        text: `${company.tradeName}${company.cnpj ? ` — CNPJ ${company.cnpj}` : ''}${company.city ? ` — ${company.city}/${company.state ?? ''}` : ''}`,
        style: 'companySmall',
      },
      { text: title, style: 'title' },
    ];
    if (subtitle) content.push({ text: subtitle, style: 'subtitle' });
    content.push({
      text: `Gerado em ${formatDateTimeBR(new Date())} — Simulador educacional Pacioli`,
      style: 'meta',
    });

    for (const table of tables) {
      if (table.title) content.push({ text: table.title, style: 'section', margin: [0, 12, 0, 4] });

      const widths = this.resolvePdfWidths(table.columns);

      content.push({
        table: {
          headerRows: 1,
          widths,
          body: [
            table.columns.map((column) => ({
              text: column.header,
              style: 'th',
              alignment: column.align ?? 'left',
            })),
            ...table.rows.map((row) =>
              row.map((value, index) => ({
                text: typeof value === 'number' ? brl(value) : value ?? '',
                alignment: table.columns[index].align ?? 'left',
                style: 'td',
              })),
            ),
          ],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => 'CCCCCC',
          vLineColor: () => 'CCCCCC',
          paddingLeft: () => 4,
          paddingRight: () => 4,
          paddingTop: () => 3,
          paddingBottom: () => 3,
        },
      });

      if (table.footer) {
        content.push({
          table: {
            widths,
            body: [
              table.footer.map((value, index) => ({
                text: typeof value === 'number' ? brl(value) : value ?? '',
                alignment: table.columns[index].align ?? 'left',
                style: 'tfooter',
              })),
            ],
          },
          layout: 'noBorders',
          margin: [0, 2, 0, 12],
        });
      }
    }

    const document = this.printer.createPdfKitDocument(
      {
        content,
        defaultStyle: { font: 'Roboto', fontSize: 9 },
        styles: {
          company: { fontSize: 13, bold: true, color: NAVY },
          companySmall: { fontSize: 9, color: '555555' },
          title: { fontSize: 14, bold: true, margin: [0, 10, 0, 2] },
          subtitle: { fontSize: 10, color: '555555' },
          meta: { fontSize: 8, color: '777777', margin: [0, 2, 0, 10] },
          section: { fontSize: 11, bold: true, color: NAVY },
          th: { bold: true, color: 'FFFFFF', fillColor: NAVY, fontSize: 8.5 },
          td: { fontSize: 8.5 },
          tfooter: { bold: true, fillColor: LIGHT, fontSize: 9 },
        },
        footer: (currentPage: number, pageCount: number) => ({
          text: `Página ${currentPage} de ${pageCount}`,
          alignment: 'center',
          fontSize: 8,
          color: '999999',
        }),
      },
      {} as any,
    );

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
      document.end();
    });
  }

  private periodLabel(filters: ExportFilters): string {
    if (filters.from || filters.to) {
      const from = filters.from ? formatIsoDateBR(filters.from) : 'início';
      const to = filters.to ? formatIsoDateBR(filters.to) : 'hoje';
      return `Período: ${from} a ${to}`;
    }
    if (filters.date) return `Data-base: ${formatIsoDateBR(filters.date)}`;
    if (filters.periodId) return 'Período contábil selecionado';
    return 'Exercício corrente';
  }

  // ──────────────────────────────────────────────
  // Conteúdos por relatório
  // ──────────────────────────────────────────────
  private async journalTables(companyId: string, filters: ExportFilters): Promise<Table[]> {
    const data = await this.journal.list(companyId, {
      from: filters.from,
      to: filters.to,
      accountId: filters.accountId,
      page: 1,
      pageSize: 200,
    } as any);

    const rows: (string | number | null)[][] = [];
    for (const entry of data.items) {
      for (const line of entry.lines) {
        rows.push([
          entry.number,
          formatIsoDateBR(entry.date.toISOString()),
          entry.history,
          `${line.account.code} — ${line.account.name}`,
          line.debit ? Number(line.debit) : null,
          line.credit ? Number(line.credit) : null,
          SOURCE_LABELS[entry.source] ?? entry.source,
        ]);
      }
    }

    return [
      {
        title: 'Livro Diário',
        columns: [
          { header: 'Nº', width: '36', align: 'center' },
          { header: 'Data', width: '56' },
          { header: 'Histórico', width: '3.2' },
          { header: 'Conta', width: '3' },
          { header: 'Débito', width: '1.1', align: 'right' },
          { header: 'Crédito', width: '1.1', align: 'right' },
          { header: 'Origem', width: '1.3' },
        ],
        rows,
        footer: ['TOTAL', null, null, null, data.sumDebit, data.sumCredit, null],
      },
    ];
  }

  private async trialBalanceTables(companyId: string, filters: ExportFilters): Promise<Table[]> {
    const report = await this.reports.trialBalance(companyId, filters as any);
    return [
      {
        title: 'Balancete de Verificação',
        columns: [
          { header: 'Código', width: '60' },
          { header: 'Conta', width: '3' },
          { header: 'Saldo anterior D', width: '1', align: 'right' },
          { header: 'Saldo anterior C', width: '1', align: 'right' },
          { header: 'Movimento D', width: '1', align: 'right' },
          { header: 'Movimento C', width: '1', align: 'right' },
          { header: 'Saldo final D', width: '1', align: 'right' },
          { header: 'Saldo final C', width: '1', align: 'right' },
        ],
        rows: report.rows.map((row) => [
          row.code,
          row.name,
          row.openingDebit,
          row.openingCredit,
          row.movementDebit,
          row.movementCredit,
          row.closingDebit,
          row.closingCredit,
        ]),
        footer: [
          'TOTAIS',
          null,
          report.totals.openingDebit,
          report.totals.openingCredit,
          report.totals.movementDebit,
          report.totals.movementCredit,
          report.totals.closingDebit,
          report.totals.closingCredit,
        ],
      },
      {
        title: 'Verificação',
        columns: [
          { header: 'Indicador', width: '3' },
          { header: 'Valor', width: '1', align: 'right' },
        ],
        rows: [
          ['Débitos e créditos iguais?', report.balanced ? 'SIM' : 'NÃO'],
          ['Divergência (débitos − créditos)', report.difference],
          ['Contas movimentadas', report.movedAccounts],
          ['Contas listadas', report.accountCount],
        ],
      },
    ];
  }

  private async balanceSheetTables(companyId: string, filters: ExportFilters): Promise<Table[]> {
    const report = await this.reports.balanceSheet(companyId, { date: filters.date });
    const rows: (string | number | null)[][] = [];
    const push = (label: string, data: { code: string; name: string; amount: number }[]) => {
      if (data.length > 0) rows.push([label, null]);
      for (const row of data) {
        rows.push([`   ${row.code} — ${row.name}`, row.amount]);
      }
    };
    push('ATIVO CIRCULANTE', report.ativo.circulante.rows);
    rows.push(['Total do Ativo Circulante', report.ativo.circulante.total]);
    push('ATIVO NÃO CIRCULANTE', report.ativo.naoCirculante.rows);
    rows.push(['Total do Ativo Não Circulante', report.ativo.naoCirculante.total]);
    rows.push(['TOTAL DO ATIVO', report.ativo.total]);
    push('PASSIVO CIRCULANTE', report.passivo.circulante.rows);
    rows.push(['Total do Passivo Circulante', report.passivo.circulante.total]);
    push('PASSIVO NÃO CIRCULANTE', report.passivo.naoCirculante.rows);
    rows.push(['Total do Passivo Não Circulante', report.passivo.naoCirculante.total]);
    rows.push(['TOTAL DO PASSIVO', report.passivo.total]);
    push('PATRIMÔNIO LÍQUIDO', report.patrimonioLiquido.rows);
    rows.push(['Resultado do Exercício', report.patrimonioLiquido.resultadoExercicio]);
    rows.push(['TOTAL DO PATRIMÔNIO LÍQUIDO', report.patrimonioLiquido.total]);
    rows.push(['TOTAL DO PASSIVO + PL', report.totalPassivoPl]);
    rows.push([`Balanço ${report.balanced ? 'EQUILIBRADO' : 'DESEQUILIBRADO'} (dif. ${brl(report.difference)})`, null]);

    return [
      {
        title: 'Balanço Patrimonial',
        columns: [
          { header: 'Conta', width: '4' },
          { header: 'Valor', width: '1', align: 'right' },
        ],
        rows,
      },
    ];
  }

  private async dreTables(companyId: string, filters: ExportFilters): Promise<Table[]> {
    const report = await this.reports.dre(companyId, {
      from: filters.from,
      to: filters.to,
      periodId: filters.periodId,
      compare: filters.compare,
    } as any);

    const rows: (string | number | null)[][] = [];
    const order = [
      'Receita Bruta',
      '(-) Deduções da Receita',
      '= Receita Líquida',
      '(-) Custo das Mercadorias Vendidas',
      '= Lucro Bruto',
      '(-) Despesas Operacionais',
    ];
    const s = report.summary;
    rows.push(['Receita Bruta de Vendas', s.receitaBruta]);
    rows.push(['(-) Deduções da Receita', -s.deducoes]);
    rows.push(['= Receita Líquida', s.receitaLiquida]);
    rows.push(['(-) Custo das Mercadorias Vendidas (CMV)', -s.cmv]);
    rows.push(['= Lucro Bruto', s.lucroBruto]);
    rows.push(['(-) Despesas Administrativas', -s.despesasAdministrativas]);
    rows.push(['(-) Despesas com Vendas', -s.despesasVendas]);
    rows.push(['(-) Despesas Financeiras', -s.despesasFinanceiras]);
    rows.push(['(+) Receitas Financeiras', s.receitasFinanceiras]);
    rows.push(['(+) Outras Receitas', s.outrasReceitas]);
    rows.push(['(-) Outras Despesas', -s.outrasDespesas]);
    rows.push(['= Resultado antes dos Tributos', s.resultadoAntesTributos]);
    rows.push(['(-) Tributos sobre o Lucro', -s.tributos]);
    rows.push(['= RESULTADO LÍQUIDO DO EXERCÍCIO', s.resultadoLiquido]);
    rows.push([`Margem líquida sobre a receita: ${s.margemLiquida}%`, null]);

    void order;

    return [
      {
        title: 'Demonstração do Resultado do Exercício',
        columns: [
          { header: 'Descrição', width: '4' },
          { header: 'Valor', width: '1', align: 'right' },
        ],
        rows,
      },
    ];
  }

  private async ledgerTables(companyId: string, filters: ExportFilters): Promise<Table[]> {
    const report = await this.reports.ledger(companyId, {
      accountId: filters.accountId,
      from: filters.from,
      to: filters.to,
      periodId: filters.periodId,
    } as any);

    return [
      {
        title: `Livro Razão — ${report.account.code} ${report.account.name}`,
        columns: [
          { header: 'Data', width: '56' },
          { header: 'Nº', width: '40', align: 'center' },
          { header: 'Histórico', width: '3' },
          { header: 'Débito', width: '1', align: 'right' },
          { header: 'Crédito', width: '1', align: 'right' },
          { header: 'Saldo', width: '1', align: 'right' },
        ],
        rows: report.lines.map((line) => [
          formatIsoDateBR(line.date),
          line.entryNumber,
          line.history,
          line.debit,
          line.credit,
          line.balance,
        ]),
        footer: [
          'TOTAIS',
          null,
          null,
          report.totalDebit,
          report.totalCredit,
          report.closingBalance,
        ],
      },
    ];
  }

  private async stockTables(companyId: string): Promise<Table[]> {
    const summary = await this.products.summary(companyId);
    return [
      {
        title: 'Relatório de Estoque',
        columns: [
          { header: 'Código', width: '60' },
          { header: 'Produto', width: '3' },
          { header: 'Categoria', width: '1.5' },
          { header: 'Un.', width: '30', align: 'center' },
          { header: 'Quantidade', width: '1', align: 'right' },
          { header: 'Custo médio', width: '1', align: 'right' },
          { header: 'Valor total', width: '1', align: 'right' },
        ],
        rows: summary.rows.map((row) => [
          row.code,
          row.name,
          row.category,
          row.unit,
          row.quantity,
          row.averageCost,
          row.stockValue,
        ]),
        footer: ['TOTAL', null, null, null, null, null, summary.totalValue],
      },
    ];
  }

  private async assetsTables(companyId: string): Promise<Table[]> {
    const data = await this.assets.list(companyId, {});
    return [
      {
        title: 'Relatório de Ativos',
        columns: [
          { header: 'Código', width: '55' },
          { header: 'Ativo', width: '2.5' },
          { header: 'Categoria', width: '1.4' },
          { header: 'Aquisição', width: '55' },
          { header: 'Custo', width: '1', align: 'right' },
          { header: 'Depreciação', width: '1', align: 'right' },
          { header: 'Valor líquido', width: '1', align: 'right' },
          { header: 'Situação', width: '55' },
        ],
        rows: data.rows.map((row) => [
          row.code,
          row.name,
          row.categoryLabel,
          formatIsoDateBR(row.acquisitionDate.toISOString?.() ?? String(row.acquisitionDate)),
          row.acquisitionValue,
          row.accumulatedDepreciation,
          row.bookValue,
          row.status,
        ]),
        footer: [
          'TOTAIS',
          null,
          null,
          null,
          data.totals.cost,
          data.totals.accumulatedDepreciation,
          data.totals.bookValue,
          null,
        ],
      },
    ];
  }

  async export(
    companyId: string,
    report: string,
    format: 'xlsx' | 'pdf',
    filters: ExportFilters,
  ) {
    const company = await this.company(companyId);
    let tables: Table[];
    let title: string;

    switch (report) {
      case 'journal':
        title = 'Livro Diário';
        tables = await this.journalTables(companyId, filters);
        break;
      case 'trial-balance':
        title = 'Balancete de Verificação';
        tables = await this.trialBalanceTables(companyId, filters);
        break;
      case 'balance-sheet':
        title = 'Balanço Patrimonial';
        tables = await this.balanceSheetTables(companyId, filters);
        break;
      case 'dre':
        title = 'DRE — Demonstração do Resultado do Exercício';
        tables = await this.dreTables(companyId, filters);
        break;
      case 'ledger':
        title = 'Livro Razão';
        tables = await this.ledgerTables(companyId, filters);
        break;
      case 'stock':
        title = 'Relatório de Estoque';
        tables = await this.stockTables(companyId);
        break;
      case 'assets':
        title = 'Relatório de Ativos';
        tables = await this.assetsTables(companyId);
        break;
      case 'accounts': {
        title = 'Plano de Contas';
        const accounts = await this.prisma.account.findMany({
          where: { companyId },
          orderBy: { code: 'asc' },
        });
        tables = [
          {
            title: 'Plano de Contas',
            columns: [
              { header: 'Código', width: '70' },
              { header: 'Nome', width: '3' },
              { header: 'Classificação', width: '1.4' },
              { header: 'Natureza', width: '1' },
              { header: 'Tipo', width: '1' },
              { header: 'Situação', width: '60' },
            ],
            rows: accounts.map((account) => [
              account.code,
              account.name,
              account.classification,
              account.nature,
              account.type,
              account.active ? 'Ativa' : 'Inativa',
            ]),
          },
        ];
        break;
      }
      default:
        throw new BadRequestException('Relatório desconhecido para exportação.');
    }

    const subtitle = this.periodLabel(filters);
    const buffer = format === 'xlsx'
      ? await this.buildWorkbook(company, title, subtitle, tables)
      : await this.buildPdf(company, title, subtitle, tables);

    return {
      buffer,
      filename: `${report}-${format === 'xlsx' ? 'excel' : 'pdf'}-${new Date().toISOString().slice(0, 10)}.${format}`,
      contentType:
        format === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf',
    };
  }
}
