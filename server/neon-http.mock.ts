// Fake do protocolo HTTP do Neon (@neondatabase/serverless) pros testes de
// HANDLER de api/ que criam o `neon(url)` por dentro (lobby, ranking). Troca o
// globalThis.fetch: cada query chega como { query, params } (ou { queries }
// numa transação) e a resposta vai no formato cru do Neon (fields + rows em
// texto, Neon-Array-Mode). O roteamento é do teste: recebe o SQL normalizado
// (espaços colapsados) e os params, e devolve as linhas como objetos.
export type FakeRow = Record<string, unknown>;
export type FakeRoute = (sql: string, params: unknown[]) => FakeRow[] | undefined;

export interface FakeNeon {
  queries: { sql: string; params: unknown[] }[];
  restore: () => void;
}

// OIDs do Postgres que o parser do driver entende (texto cru → valor JS)
const OID = { bool: 16, float8: 701, text: 25, jsonb: 3802 } as const;

function encode(rows: FakeRow[]): { fields: { name: string; dataTypeID: number }[]; rows: (string | null)[][] } {
  const names = rows.length ? Object.keys(rows[0]) : [];
  const fields = names.map((name) => {
    const v = rows.find((r) => r[name] != null)?.[name];
    const dataTypeID = typeof v === 'boolean' ? OID.bool : typeof v === 'number' ? OID.float8 : v !== null && typeof v === 'object' ? OID.jsonb : OID.text;
    return { name, dataTypeID };
  });
  const cell = (v: unknown): string | null => (v == null ? null : typeof v === 'boolean' ? (v ? 't' : 'f') : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return { fields, rows: rows.map((r) => names.map((n) => cell(r[n]))) };
}

// DATABASE_URL de mentira (o host nunca é resolvido: o fetch é nosso)
export const FAKE_DATABASE_URL = 'postgresql://fake:fake@ep-fake-000000.us-east-2.aws.neon.tech/neondb';

export function installFakeNeon(route: FakeRoute): FakeNeon {
  const original = globalThis.fetch;
  const queries: FakeNeon['queries'] = [];
  const run = (q: { query: string; params?: unknown[] }) => {
    const sql = q.query.replace(/\s+/g, ' ').trim();
    const params = q.params ?? [];
    queries.push({ sql, params });
    return encode(route(sql, params) ?? []);
  };
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { query?: string; params?: unknown[]; queries?: { query: string; params?: unknown[] }[] };
    try {
      const payload = body.queries ? { results: body.queries.map(run) } : run({ query: String(body.query), params: body.params });
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
    } catch (e) {
      // erro do "Postgres": o driver lê { message } num 400 e lança
      return new Response(JSON.stringify({ message: String((e as Error).message ?? e) }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
  }) as typeof fetch;
  return { queries, restore: () => { globalThis.fetch = original; } };
}

// res mínimo compatível com os handlers (status().json()/end(), setHeader)
export interface CapturedRes {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  status: (code: number) => { json: (b: unknown) => void; end: () => void };
  setHeader: (k: string, v: string) => void;
}
export function captureRes(): CapturedRes {
  const r: CapturedRes = {
    statusCode: 0,
    body: undefined,
    headers: {},
    status(code: number) {
      r.statusCode = code;
      return { json: (b: unknown) => { r.body = b; }, end: () => { r.body = null; } };
    },
    setHeader(k: string, v: string) { r.headers[k.toLowerCase()] = v; },
  };
  return r;
}
