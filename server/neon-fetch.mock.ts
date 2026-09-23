// Fake do endpoint HTTP do Neon pros testes de HANDLER (api/*.ts), sem banco.
// As rotas chamam neon(DATABASE_URL) direto; o driver aceita trocar o fetch por
// neonConfig.fetchFunction, então o teste intercepta cada query (texto + params)
// e devolve as linhas que o roteador do teste decidir. Transações ({queries})
// viram uma chamada ao roteador por statement, na ordem.
import { neonConfig } from '@neondatabase/serverless';

export type Row = Record<string, unknown>;
export interface SeenQuery { text: string; params: unknown[] }
export type Router = (q: SeenQuery) => Row[] | undefined;

// OIDs do Postgres que o driver sabe parsear a partir do texto cru.
function encode(value: unknown): { oid: number; text: string | null } {
  if (value === null || value === undefined) return { oid: 25, text: null };
  if (typeof value === 'boolean') return { oid: 16, text: value ? 't' : 'f' };
  if (typeof value === 'number') return { oid: Number.isInteger(value) ? 20 : 701, text: String(value) };
  if (value instanceof Date) return { oid: 1184, text: value.toISOString() };
  if (typeof value === 'object') return { oid: 3802, text: JSON.stringify(value) };
  return { oid: 25, text: String(value) };
}

function result(rows: Row[]) {
  const names = rows.length ? Object.keys(rows[0]) : [];
  const oids = names.map((n) => encode(rows.find((r) => r[n] !== null && r[n] !== undefined)?.[n]).oid);
  return {
    fields: names.map((name, i) => ({ name, dataTypeID: oids[i] })),
    rows: rows.map((r) => names.map((n) => encode(r[n]).text)),
    command: 'SELECT',
    rowCount: rows.length,
  };
}

export class FakeNeonHttp {
  seen: SeenQuery[] = [];
  private router: Router;

  constructor(router: Router = () => []) {
    this.router = router;
  }

  setRouter(router: Router): void { this.router = router; }

  // texto normalizado (espaços colapsados) de todas as queries vistas
  texts(): string[] { return this.seen.map((q) => q.text); }

  install(): () => void {
    const prev = neonConfig.fetchFunction;
    neonConfig.fetchFunction = async (_url: string, init: { body: string }) => {
      const payload = JSON.parse(init.body) as { query?: string; params?: unknown[]; queries?: { query: string; params: unknown[] }[] };
      const run = (q: { query: string; params: unknown[] }) => {
        const seen = { text: q.query.replace(/\s+/g, ' ').trim(), params: q.params ?? [] };
        this.seen.push(seen);
        return result(this.router(seen) ?? []);
      };
      const body = payload.queries ? { results: payload.queries.map(run) } : run({ query: payload.query ?? '', params: payload.params ?? [] });
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    return () => { neonConfig.fetchFunction = prev; };
  }
}

// Emulação da tabela rtm_rate_limits dentro do roteador (mesma semântica do
// UPSERT de janela fixa de server/rate-limit.ts). Devolve undefined se a query
// não for do rate limit, pro roteador do teste seguir adiante.
export function rateLimitRoute(store: Map<string, number>): Router {
  return (q) => {
    if (q.text.startsWith('INSERT INTO rtm_rate_limits')) {
      const [keys] = q.params as [string];
      // o driver manda arrays como literal de array do Postgres: {"a","b"}
      const list = String(keys).replace(/^\{|\}$/g, '').split(',').map((k) => k.replace(/^"|"$/g, ''));
      return list.map((key) => {
        const count = (store.get(key) ?? 0) + 1;
        store.set(key, count);
        return { key, count, retry_after: 60 };
      });
    }
    if (q.text.startsWith('SELECT key, count')) {
      const [keys] = q.params as [string];
      const list = String(keys).replace(/^\{|\}$/g, '').split(',').map((k) => k.replace(/^"|"$/g, ''));
      return list.filter((k) => store.has(k)).map((key) => ({ key, count: store.get(key) ?? 0, retry_after: 60 }));
    }
    if (q.text.includes('rtm_rate_limits')) return [];
    return undefined;
  };
}
