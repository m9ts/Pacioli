/** Formata número no padrão brasileiro sem depender do ICU do ambiente. */
export function brl(value: number | string | null | undefined, prefix = ''): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return `${prefix}0,00`;
  const negative = n < 0;
  const [intPart, decPart] = Math.abs(n).toFixed(2).split('.');
  const withThousand = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${prefix}${withThousand},${decPart}`;
}

export function formatDateTimeBR(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
}

export function formatIsoDateBR(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
