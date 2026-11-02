// FLAG do paywall (demo do Road to Pro após a 2ª partida + Major Singapura/Pick'em
// além da 1ª etapa para quem não tem a vitalícia). Liga/desliga SEM deploy:
//
//   1) rtm_settings (key 'paywall_gate', value 'on'|'off') — lida em runtime pelo
//      GET público /api/liveops (cache de 5 min no navegador). Tabela criada pela
//      migration scripts/migrations/2026-11-02-paywall-settings.sql (NÃO rodada).
//      Sem a tabela/linha, cai no passo 2.
//   2) env PAYWALL_GATE ('on'|'off') — kill switch; na Vercel, mudar env exige
//      redeploy, então serve só de reserva.
//   3) padrão: OFF (o deploy deste PR não muda nada para ninguém).
//
// O banco vence o env: com a linha gravada, o env não importa.

export type GateValue = 'on' | 'off';

export function parseGate(v: unknown): GateValue | null {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'on' || s === '1' || s === 'true') return 'on';
  if (s === 'off' || s === '0' || s === 'false') return 'off';
  return null;
}

/** Puro: decide o estado da flag a partir do banco e do env. Padrão OFF. */
export function resolvePaywallGate(dbValue: unknown, envValue: unknown): boolean {
  const fromDb = parseGate(dbValue);
  if (fromDb) return fromDb === 'on';
  return parseGate(envValue) === 'on';
}

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

/** Lê a flag. Nunca lança: tabela ausente/erro de banco = segue env/padrão (OFF). Só SELECT. */
export async function readPaywallGate(sql: Sql, env: string | undefined): Promise<boolean> {
  let dbValue: unknown = null;
  try {
    const rows = await sql`SELECT value FROM rtm_settings WHERE key = 'paywall_gate' LIMIT 1`;
    dbValue = rows[0]?.value ?? null;
  } catch { /* migration não rodou: tolera */ }
  return resolvePaywallGate(dbValue, env);
}
