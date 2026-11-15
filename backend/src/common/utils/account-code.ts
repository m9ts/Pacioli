/** Compara códigos de conta respeitando a hierarquia numérica (1.1.2 < 1.1.10). */
export function compareAccountCode(a: string, b: string): number {
  const pa = a.split('.');
  const pb = b.split('.');
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = Number(pa[i] ?? 0);
    const nb = Number(pb[i] ?? 0);
    if (na !== nb) return na - nb;
  }
  return a.localeCompare(b);
}
