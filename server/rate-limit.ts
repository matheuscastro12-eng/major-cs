// Rate limit COMPARTILHADO entre instâncias (O0-35/O0-16/O0-36). O Map em
// memória que as rotas usam vale só por instância da Vercel Function: um
// ataque distribuído cai em instâncias diferentes e nunca bate o limite. Aqui
// o contador mora no Postgres (tabela rtm_rate_limits, uma linha por chave,
// janela fixa), com um único round-trip por checagem, mesmo com várias chaves
// (ex.: IP + e-mail no login).
//
// Falha do banco não derruba a rota: cai no limitador em memória (degrada pra
// "por instância", que é o que existia antes) e loga.
//
// Custo Neon: a linha é reaproveitada (UPSERT), então a tabela cresce com o
// número de chaves distintas, não de requests. A limpeza das janelas vencidas é
// throttled (1x/6h por instância) e usa o índice em reset_at — nunca uma
// varredura por request (ver o incidente da retenção grudada no INSERT).

// cliente sql do neon usado como template tag (basta a forma de tagged template).
export type RateSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

export interface RateRule {
  key: string;       // ex.: 'login:ip:1.2.3.4' — escopo:tipo:valor
  limit: number;     // requests permitidos na janela
  windowSec: number; // tamanho da janela fixa
}

export interface RateDecision {
  limited: boolean;
  retryAfterSec: number; // quanto falta pra janela da regra estourada reabrir (0 se livre)
  key?: string;          // a regra que estourou
}

let schemaReady = false;
let lastCleanupAt = 0;
const CLEANUP_MS = 6 * 60 * 60_000;

export function rateLimitSchemaQueries(sql: RateSql): Promise<Record<string, unknown>[]>[] {
  return [
    sql`CREATE TABLE IF NOT EXISTS rtm_rate_limits (key TEXT PRIMARY KEY, count INT NOT NULL DEFAULT 0, reset_at TIMESTAMPTZ NOT NULL)`,
    sql`CREATE INDEX IF NOT EXISTS rtm_rate_limits_reset_idx ON rtm_rate_limits (reset_at)`,
  ];
}

// ── fallback em memória (por instância) ──────────────────────────────────────
const memBuckets = new Map<string, { count: number; resetAt: number }>();

export function memoryRateHit(rule: RateRule, now = Date.now()): RateDecision {
  if (memBuckets.size > 5000) memBuckets.clear();
  const cur = memBuckets.get(rule.key);
  if (!cur || cur.resetAt <= now) {
    memBuckets.set(rule.key, { count: 1, resetAt: now + rule.windowSec * 1000 });
    return { limited: rule.limit < 1, retryAfterSec: rule.limit < 1 ? rule.windowSec : 0, key: rule.limit < 1 ? rule.key : undefined };
  }
  cur.count += 1;
  if (cur.count > rule.limit) return { limited: true, retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)), key: rule.key };
  return { limited: false, retryAfterSec: 0 };
}

function memoryDecision(rules: RateRule[]): RateDecision {
  let out: RateDecision = { limited: false, retryAfterSec: 0 };
  for (const r of rules) {
    const d = memoryRateHit(r);
    if (d.limited && d.retryAfterSec >= out.retryAfterSec) out = d;
  }
  return out;
}

// ── Postgres ─────────────────────────────────────────────────────────────────
async function ensureSchema(sql: RateSql): Promise<void> {
  if (schemaReady) return;
  for (const q of rateLimitSchemaQueries(sql)) await q;
  schemaReady = true;
}

// Conta +1 em TODAS as regras e diz se alguma estourou. Janela fixa: quando
// reset_at já passou, o contador recomeça em 1 com uma janela nova.
export async function rateLimitHit(sql: RateSql | null, rules: RateRule[]): Promise<RateDecision> {
  const valid = rules.filter((r) => r.key && r.limit >= 0 && r.windowSec > 0);
  if (!valid.length) return { limited: false, retryAfterSec: 0 };
  if (!sql) return memoryDecision(valid);
  try {
    await ensureSchema(sql);
    const keys = valid.map((r) => r.key.slice(0, 200));
    const windows = valid.map((r) => Math.floor(r.windowSec));
    const rows = await sql`
      INSERT INTO rtm_rate_limits (key, count, reset_at)
      SELECT k, 1, now() + make_interval(secs => w)
      FROM unnest(${keys}::text[], ${windows}::int[]) AS t(k, w)
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rtm_rate_limits.reset_at <= now() THEN 1 ELSE rtm_rate_limits.count + 1 END,
        reset_at = CASE WHEN rtm_rate_limits.reset_at <= now() THEN EXCLUDED.reset_at ELSE rtm_rate_limits.reset_at END
      RETURNING key, count, GREATEST(0, CEIL(EXTRACT(EPOCH FROM (reset_at - now()))))::int AS retry_after`;
    await cleanup(sql);
    return decide(valid, rows);
  } catch (error) {
    console.error('rate_limit_store_failed', error instanceof Error ? error.message : error);
    return memoryDecision(valid);
  }
}

// Só LÊ os contadores (não conta). Serve pra barrar antes de fazer trabalho —
// ex.: o admin checa se o IP já estourou as falhas ANTES de validar a senha, senão
// o atacante continuaria chutando e veria o 200 quando acertasse.
export async function rateLimitPeek(sql: RateSql | null, rules: RateRule[]): Promise<RateDecision> {
  const valid = rules.filter((r) => r.key && r.limit >= 0 && r.windowSec > 0);
  if (!valid.length) return { limited: false, retryAfterSec: 0 };
  if (!sql) {
    const now = Date.now();
    for (const r of valid) {
      const cur = memBuckets.get(r.key);
      if (cur && cur.resetAt > now && cur.count >= r.limit) {
        return { limited: true, retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)), key: r.key };
      }
    }
    return { limited: false, retryAfterSec: 0 };
  }
  try {
    await ensureSchema(sql);
    const keys = valid.map((r) => r.key.slice(0, 200));
    const rows = await sql`
      SELECT key, count, GREATEST(0, CEIL(EXTRACT(EPOCH FROM (reset_at - now()))))::int AS retry_after
      FROM rtm_rate_limits WHERE key = ANY(${keys}::text[]) AND reset_at > now()`;
    // peek: estoura quando JÁ chegou no limite (o próximo hit passaria dele).
    return decide(valid.map((r) => ({ ...r, limit: r.limit - 1 })), rows);
  } catch (error) {
    console.error('rate_limit_store_failed', error instanceof Error ? error.message : error);
    return { limited: false, retryAfterSec: 0 };
  }
}

function decide(rules: RateRule[], rows: Record<string, unknown>[]): RateDecision {
  let out: RateDecision = { limited: false, retryAfterSec: 0 };
  for (const row of rows) {
    const rule = rules.find((r) => r.key.slice(0, 200) === String(row.key));
    if (!rule) continue;
    if (Number(row.count) > rule.limit) {
      const retry = Math.max(1, Number(row.retry_after) || 1);
      if (!out.limited || retry > out.retryAfterSec) out = { limited: true, retryAfterSec: retry, key: rule.key };
    }
  }
  return out;
}

async function cleanup(sql: RateSql): Promise<void> {
  if (Date.now() - lastCleanupAt < CLEANUP_MS) return;
  lastCleanupAt = Date.now();
  try {
    await sql`DELETE FROM rtm_rate_limits WHERE reset_at < now() - interval '1 hour'`;
  } catch { /* limpeza é oportunista; tenta de novo na próxima janela */ }
}

// IP do cliente. Na Vercel o x-forwarded-for é reescrito pela borda (o primeiro
// item é o IP real); x-real-ip é o fallback. Mesmo formato das rotas existentes.
export function clientIp(headers?: Record<string, string | string[] | undefined>): string {
  const raw = headers?.['x-forwarded-for'] ?? headers?.['x-real-ip'] ?? '';
  const value = Array.isArray(raw) ? raw[0] : String(raw);
  return value.split(',')[0].trim().slice(0, 64) || 'unknown';
}

// Resposta 429 padrão. Devolve true quando respondeu (a rota para).
export function respondLimited(
  res: { status: (code: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void },
  decision: RateDecision,
  message = 'Muitas tentativas. Espere um pouco e tente de novo.',
): boolean {
  if (!decision.limited) return false;
  res.setHeader('Retry-After', String(Math.max(1, decision.retryAfterSec)));
  res.status(429).json({ error: message, retryAfter: Math.max(1, decision.retryAfterSec) });
  return true;
}

// só pros testes: zera o estado por instância (schema, limpeza e memória).
export function __resetRateLimitForTests(): void {
  schemaReady = false;
  lastCleanupAt = 0;
  memBuckets.clear();
}
