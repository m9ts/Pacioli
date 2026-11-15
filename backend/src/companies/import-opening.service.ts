import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { AccountClassification, AccountType } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../common/prisma/prisma.service';
import { CompaniesService } from './companies.service';
import { AuthUser } from '../common/decorators';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export interface ImportPayload {
  legalName: string;
  tradeName: string;
  cnpj?: string;
  city?: string;
  state?: string;
  email?: string;
  segment: string;
  openingDate: string;
  responsibleName: string;
  initialCapital: number;
}

interface ParsedRow {
  kind: 'BEM' | 'DIREITO' | 'OBRIGACAO';
  description: string;
  accountKey: string;
  value: number;
  rowNumber: number;
}

/** Remove acentos e normaliza para comparações. */
function fold(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Converte célula em número aceitando formatos pt-BR ("1.234,56") e "1,234.56". */
function parseMoney(cell: unknown): number | null {
  if (cell == null || cell === '') return null;
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null;
  let text = String(cell)
    .replace(/\u00a0/g, ' ')
    .replace(/r\$/gi, '')
    .trim();
  if (!text) return null;
  text = text.replace(/[^\d.,-]/g, '');
  if (text.includes(',') && text.includes('.')) {
    // O separador decimal é o último que aparece.
    if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (text.includes(',')) {
    text = text.replace(',', '.');
  }
  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? value : null;
}

function normalizeKind(cell: unknown): ParsedRow['kind'] | null {
  const text = fold(cell).replace(/[^a-z]/g, '');
  if (!text) return null;
  if (text.startsWith('bem')) return 'BEM';
  if (text.startsWith('direito')) return 'DIREITO';
  if (text.startsWith('obrig') || text.startsWith('passiv')) return 'OBRIGACAO';
  return null;
}

/** Parser CSV minimalista com suporte a aspas e detecção de separador (; ou ,). */
function parseCsv(text: string): string[][] {
  const delimiter = (() => {
    const header = text.split(/\r?\n/, 1)[0] ?? '';
    const semicolons = (header.match(/;/g) ?? []).length;
    const commas = (header.match(/,/g) ?? []).length;
    return semicolons > commas ? ';' : ',';
  })();

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((cell) => cell.trim() !== ''));
}

@Injectable()
export class ImportOpeningService {
  constructor(
    private readonly companies: CompaniesService,
    private readonly prisma: PrismaService,
  ) {}

  async import(user: AuthUser, file: Express.Multer.File | undefined, rawPayload: string) {
    if (!file) throw new BadRequestException('Envie a planilha no campo "file".');
    if (file.size > MAX_FILE_SIZE) {
      throw new PayloadTooLargeException('A planilha deve ter no máximo 5 MB.');
    }
    if (!rawPayload) {
      throw new BadRequestException('Envie os dados da empresa no campo "payload".');
    }

    let payload: ImportPayload;
    try {
      payload = JSON.parse(rawPayload.replace(/^\uFEFF/, '').trim());
    } catch {
      throw new BadRequestException('O campo "payload" deve ser um JSON válido.');
    }
    if (!payload.legalName || !payload.tradeName || !payload.openingDate || !payload.responsibleName) {
      throw new BadRequestException(
        'Dados incompletos da empresa: razão social, nome fantasia, data de abertura e responsável são obrigatórios.',
      );
    }
    const initialCapital = Number(payload.initialCapital);
    if (!Number.isFinite(initialCapital) || initialCapital <= 0) {
      throw new BadRequestException('Informe um capital social maior que zero.');
    }

    const rows = await this.parseSpreadsheet(file);
    if (rows.length === 0) {
      throw new BadRequestException(
        'A planilha não contém itens. Verifique as colunas Tipo, Conta, Descrição e Valor.',
      );
    }

    const company = await this.companies.create(user, {
      legalName: String(payload.legalName).trim(),
      tradeName: String(payload.tradeName).trim(),
      cnpj: payload.cnpj ? String(payload.cnpj).replace(/\D/g, '') : undefined,
      city: payload.city,
      state: payload.state,
      email: payload.email,
      segment: payload.segment as any,
      openingDate: String(payload.openingDate),
      responsibleName: String(payload.responsibleName).trim(),
      initialCapital,
    } as any);

    const items = await this.mapRows(company.id, rows);
    const openingDate = new Date(`${String(payload.openingDate).slice(0, 10)}T12:00:00`);
    const endDate = new Date(openingDate);
    endDate.setFullYear(endDate.getFullYear() + 1);
    endDate.setDate(endDate.getDate() - 1);
    const year = openingDate.getFullYear();

    const opening = await this.companies.completeOpening(user, company.id, {
      period: {
        name: `Exercício ${year}`,
        startDate: String(payload.openingDate).slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
      },
      capital: initialCapital,
      items: items.map((item) => ({
        kind: item.kind,
        description: item.description,
        accountId: item.accountId,
        value: item.value,
      })),
    } as any);

    return {
      companyId: company.id,
      itemsImported: items.length,
      ...opening,
      message: 'Planilha importada e abertura concluída com sucesso.',
    };
  }

  private async parseSpreadsheet(file: Express.Multer.File): Promise<ParsedRow[]> {
    const name = (file.originalname ?? '').toLowerCase();
    const isCsv = name.endsWith('.csv') || (file.mimetype ?? '').includes('csv');
    const isXlsx =
      name.endsWith('.xlsx') || (file.mimetype ?? '').includes('spreadsheet') || (file.mimetype ?? '').includes('excel');

    if (!isCsv && !isXlsx) {
      throw new UnsupportedMediaTypeException('Formato não suportado. Envie um arquivo .xlsx ou .csv.');
    }

    const matrix: unknown[][] = isCsv
      ? parseCsv(file.buffer.toString('utf8'))
      : await this.readXlsx(file.buffer);

    return this.extractRows(matrix);
  }

  private async readXlsx(buffer: Buffer): Promise<unknown[][]> {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);
      const sheet = workbook.worksheets[0];
      if (!sheet) return [];
      const matrix: unknown[][] = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        const values: unknown[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          values.push(cell.value);
        });
        matrix.push(values);
      });
      return matrix;
    } catch {
      throw new BadRequestException('Não foi possível ler a planilha .xlsx enviada.');
    }
  }

  /** Localiza o cabeçalho (Tipo / Conta / Descrição / Valor) e converte as linhas seguintes. */
  private extractRows(matrix: unknown[][]): ParsedRow[] {
    const headers = matrix.map((row) => row.map((cell) => fold(cell).replace(/\s+/g, ' ')));

    let headerIndex = -1;
    let tipoCol = -1;
    let contaCol = -1;
    let descricaoCol = -1;
    let valorCol = -1;

    for (let r = 0; r < headers.length && r < 25; r++) {
      const row = headers[r];
      const tipo = row.findIndex((cell) => cell === 'tipo' || cell.startsWith('tipo '));
      const conta = row.findIndex((cell) => cell.startsWith('conta') || cell === 'codigo');
      const descricao = row.findIndex((cell) => cell.startsWith('descric') || cell === 'historico');
      const valor = row.findIndex((cell) => cell.startsWith('valor') || cell === 'saldo');
      if (tipo >= 0 && valor >= 0) {
        headerIndex = r;
        tipoCol = tipo;
        contaCol = conta;
        descricaoCol = descricao;
        valorCol = valor;
        break;
      }
    }

    if (headerIndex < 0) {
      throw new BadRequestException(
        'Cabeçalho não encontrado. A planilha deve ter colunas "Tipo", "Conta", "Descrição" e "Valor".',
      );
    }

    const rows: ParsedRow[] = [];
    for (let r = headerIndex + 1; r < matrix.length; r++) {
      const raw = matrix[r];
      const kind = normalizeKind(raw[tipoCol]);
      const value = parseMoney(raw[valorCol]);
      if (!kind && (value == null || value === 0)) continue; // linha em branco/rótulo
      if (!kind) {
        continue; // linha sem tipo válido — ignorada
      }
      if (value == null || value <= 0) {
        throw new BadRequestException(
          `Linha ${r + 1}: valor inválido ("${String(raw[valorCol] ?? '')}").`,
        );
      }
      const descriptionCol = descricaoCol >= 0 ? descricaoCol : contaCol;
      const description = String(raw[descriptionCol] ?? '').trim();
      const accountKey = String(raw[contaCol >= 0 ? contaCol : descricaoCol] ?? '').trim();
      if (!description && !accountKey) {
        throw new BadRequestException(`Linha ${r + 1}: informe a conta e a descrição do item.`);
      }
      rows.push({
        kind,
        description: description || accountKey,
        accountKey,
        value,
        rowNumber: r + 1,
      });
    }
    return rows;
  }

  private async mapRows(companyId: string, rows: ParsedRow[]) {
    const accounts = await this.prismaAccountList(companyId);
    const byCode = new Map(accounts.map((a) => [a.normalizedCode, a]));
    const byName = new Map(accounts.filter((a) => a.name).map((a) => [fold(a.name), a]));

    const mapped: { kind: ParsedRow['kind']; description: string; accountId: string; value: number }[] = [];
    const errors: string[] = [];

    for (const row of rows) {
      const key = fold(row.accountKey).replace(/[.\s-]/g, '');
      const account = byCode.get(key) ?? byName.get(fold(row.accountKey)) ?? null;
      if (!account) {
        errors.push(`Linha ${row.rowNumber}: conta "${row.accountKey}" não encontrada no plano de contas padrão.`);
        continue;
      }
      if (account.type !== AccountType.ANALITICA || !account.active) {
        errors.push(`Linha ${row.rowNumber}: a conta ${account.code} — ${account.name} não aceita lançamentos.`);
        continue;
      }
      const isLiability = row.kind === 'OBRIGACAO';
      const expected = isLiability ? AccountClassification.PASSIVO : AccountClassification.ATIVO;
      if (account.classification !== expected) {
        errors.push(
          `Linha ${row.rowNumber}: ${isLiability ? 'obrigações' : 'bens e direitos'} devem usar contas do ${
            isLiability ? 'Passivo' : 'Ativo'
          } (conta ${account.code} é ${account.classification}).`,
        );
        continue;
      }
      mapped.push({
        kind: row.kind,
        description: row.description || account.name,
        accountId: account.id,
        value: row.value,
      });
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        message: `A planilha contém problemas (${errors.length}). Corrija e envie novamente.`,
        errors,
      });
    }
    return mapped;
  }

  private prismaAccountList(companyId: string) {
    return this.prisma.account
      .findMany({
        where: { companyId },
        select: { id: true, code: true, name: true, classification: true, type: true, active: true },
      })
      .then((accounts) =>
        accounts.map((account) => ({
          ...account,
          normalizedCode: fold(account.code).replace(/[.\s-]/g, ''),
        })),
      );
  }
}
