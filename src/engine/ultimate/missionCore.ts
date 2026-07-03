// Núcleo genérico das missões seeded — compartilhado entre as diárias
// (missions.ts) e as semanais (weeklyMissions.ts): hash estável de uma chave
// string (dateKey/weekKey) → seed, sorteio de N metas do pool sem reposição e
// checagem de progresso contra a meta. Puro.
import { makeRng } from '../rng';

// hash simples e estável da chave do período → seed do sorteio.
export function seedHash(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = ((h * 31) + key.charCodeAt(i)) >>> 0;
  return h || 1;
}

// sorteia `count` missões do pool sem reposição, determinístico pela chave.
export function drawMissions<T>(pool: readonly T[], key: string, count: number): T[] {
  const rng = makeRng(seedHash(key));
  const rest = [...pool];
  const out: T[] = [];
  for (let i = 0; i < count && rest.length; i++) {
    out.push(rest.splice(Math.floor(rng() * rest.length), 1)[0]);
  }
  return out;
}

// progresso de uma meta contra os fatos do período (valor, concluída, %).
export function goalProgress<M extends string>(
  def: { metric: M; target: number },
  facts: Record<M, number>,
): { value: number; done: boolean; pct: number } {
  const value = Math.max(0, facts[def.metric] ?? 0);
  return { value, done: value >= def.target, pct: Math.min(100, Math.round((value / def.target) * 100)) };
}
