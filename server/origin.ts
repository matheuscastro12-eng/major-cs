// [CSM-4] Checagem de Origin nas MUTAÇÕES (api/ultimate-economy.ts e POST de
// api/lobby.ts). Defesa em profundidade: o token vai no corpo (não em cookie),
// então o risco de CSRF já é baixo; isto barra página de terceiro chamando a
// rota a partir do navegador de quem está logado.
//
// Permitido (igualdade exata de origem, sem path):
//   - o domínio oficial e o www;
//   - o próprio deploy (VERCEL_URL / VERCEL_BRANCH_URL, injetados pela Vercel —
//     cobre os previews) e a origem do próprio Host da requisição (mesma origem);
//   - a lista APP_ORIGINS (separada por vírgula; mesma env do checkout);
//   - localhost/127.0.0.1 fora de produção.
// Sem cabeçalho Origin: permitido por padrão (navegador SEMPRE manda Origin em
// POST de fetch; sem ele é cliente fora do navegador, que forja o que quiser de
// qualquer jeito). ORIGIN_REQUIRE=1 passa a exigir. Sec-Fetch-Site: cross-site
// é recusado mesmo sem Origin.
export const OFFICIAL_ORIGINS = ['https://roadtomajor.com.br', 'https://www.roadtomajor.com.br'] as const;

type Headers = Record<string, string | string[] | undefined> | undefined;
type Env = Record<string, string | undefined>;

const one = (h: Headers, k: string): string => {
  const v = h?.[k] ?? h?.[k.toLowerCase()];
  return (Array.isArray(v) ? v[0] : v ?? '').trim();
};
const cleanEnv = (v?: string) => (v ?? '').replace(new RegExp('^\uFEFF'), '').trim();

export function allowedOrigins(env: Env = process.env): Set<string> {
  return new Set<string>([
    ...OFFICIAL_ORIGINS,
    ...[env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL].map(cleanEnv).filter(Boolean).map((h) => `https://${h}`),
    ...cleanEnv(env.APP_ORIGINS).split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean),
  ]);
}

export type OriginCheck = { ok: true } | { ok: false; reason: 'cross_site' | 'origin_missing' | 'origin_not_allowed' };

export function checkMutationOrigin(headers: Headers, env: Env = process.env): OriginCheck {
  const raw = one(headers, 'origin');
  const site = one(headers, 'sec-fetch-site').toLowerCase();
  if (!raw || raw === 'null') {
    if (site === 'cross-site') return { ok: false, reason: 'cross_site' };
    return cleanEnv(env.ORIGIN_REQUIRE) === '1' ? { ok: false, reason: 'origin_missing' } : { ok: true };
  }
  let origin: string;
  try { origin = new URL(raw).origin; } catch { return { ok: false, reason: 'origin_not_allowed' }; }
  if (allowedOrigins(env).has(origin)) return { ok: true };
  // mesma origem: Origin == https://<Host> (domínio customizado, beta, etc.)
  const host = one(headers, 'x-forwarded-host') || one(headers, 'host');
  if (host && (origin === `https://${host}` || (env.VERCEL_ENV !== 'production' && origin === `http://${host}`))) return { ok: true };
  if (env.VERCEL_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return { ok: true };
  return { ok: false, reason: 'origin_not_allowed' };
}
