import type { RateSql } from './rate-limit.js';

// Fake do tag `sql` do Neon: emula a tabela rtm_rate_limits (UPSERT de janela
// fixa, SELECT do peek e a limpeza), com relógio controlado pelo teste.
export class FakeRateDb {
  rows = new Map<string, { count: number; resetAt: number }>();
  now = 1_000_000_000;
  queries: string[] = [];
  fail = false;

  // preguiçoso como o NeonQueryPromise: só executa no then (o schema monta um
  // array de queries e as aguarda uma a uma).
  sql: RateSql = (strings: TemplateStringsArray, ...params: unknown[]) => {
    const run = () => this.run(strings.join('?').replace(/\s+/g, ' ').trim(), params);
    return { then: (ok: never, err: never) => Promise.resolve().then(run).then(ok, err) } as unknown as Promise<Record<string, unknown>[]>;
  };

  private async run(text: string, params: unknown[]): Promise<Record<string, unknown>[]> {
    this.queries.push(text);
    if (this.fail) throw new Error('neon fora do ar');
    if (text.startsWith('CREATE')) return [];
    if (text.startsWith('INSERT INTO rtm_rate_limits')) {
      const [keys, wins] = params as [string[], number[]];
      return keys.map((key, i) => {
        const cur = this.rows.get(key);
        if (!cur || cur.resetAt <= this.now) this.rows.set(key, { count: 1, resetAt: this.now + wins[i] * 1000 });
        else cur.count += 1;
        const row = this.rows.get(key)!;
        return { key, count: row.count, retry_after: Math.ceil((row.resetAt - this.now) / 1000) };
      });
    }
    if (text.startsWith('SELECT key, count')) {
      const [keys] = params as [string[]];
      return keys.flatMap((key) => {
        const row = this.rows.get(key);
        return row && row.resetAt > this.now ? [{ key, count: row.count, retry_after: Math.ceil((row.resetAt - this.now) / 1000) }] : [];
      });
    }
    if (text.startsWith('DELETE FROM rtm_rate_limits')) return [];
    throw new Error(`query inesperada: ${text}`);
  };
}
