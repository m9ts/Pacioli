import { Prisma } from '@prisma/client';

export const Decimal = Prisma.Decimal;
export type DecimalValue = Prisma.Decimal | string | number;

/** Converte um valor para Decimal com segurança. */
export function dec(value: DecimalValue | null | undefined): Prisma.Decimal {
  if (value === null || value === undefined || value === '') return new Prisma.Decimal(0);
  return new Prisma.Decimal(value as any);
}

/** Arredonda valores monetários em 2 casas, meio para cima. */
export function money(value: DecimalValue | null | undefined): Prisma.Decimal {
  return dec(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Arredonda quantidades em 3 casas. */
export function quantity(value: DecimalValue | null | undefined): Prisma.Decimal {
  return dec(value).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}

/** Formata quantidade para textos em pt-BR, sem zeros à direita (ex.: 4; 0,5; 1,25). */
export function formatQuantity(value: DecimalValue | null | undefined): string {
  const text = quantity(value).toFixed(3).replace(/\.?0+$/, '');
  return (text === '' ? '0' : text).replace('.', ',');
}

/** Arredonda custos unitários em 4 casas. */
export function unitCost(value: DecimalValue | null | undefined): Prisma.Decimal {
  return dec(value).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}

export function toNumber(value: DecimalValue | null | undefined): number {
  return Number(dec(value).toFixed(2));
}

export function sumDecimals(values: DecimalValue[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((acc, value) => acc.plus(dec(value)), new Prisma.Decimal(0));
}

/** Serializa Decimal para number (uso em respostas HTTP). */
export function serialize<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (v instanceof Prisma.Decimal) return Number(v.toString());
      return v;
    }),
  );
}
