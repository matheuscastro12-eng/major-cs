// [O0-01] Smoke pós-deploy das rotas que caíram em set/2026 (DADO-01): bate
// em cada GET público numa BASE_URL (o preview da Vercel, antes de promover) e
// FALHA (exit 1) se alguma responder 5xx ou não responder. 4xx não reprova:
// a rota subiu e o módulo carregou, que é o que o smoke prova.
//
//   BASE_URL=https://<preview>.vercel.app npx tsx scripts/smoke-api.mts
//   npx tsx scripts/smoke-api.mts https://<preview>.vercel.app
//
// Preview protegido (Vercel Authentication): passe o bypass em
// VERCEL_AUTOMATION_BYPASS_SECRET e ele vai no header x-vercel-protection-bypass.
export const SMOKE_PATHS = ['/api/ranking?action=ladder', '/api/liveops', '/api/lobby?list=1'];

export interface SmokeResult { path: string; status: number | null; ms: number; error?: string }

export async function smokeApi(baseUrl: string, opts: { fetchImpl?: typeof fetch; timeoutMs?: number; bypass?: string } = {}): Promise<SmokeResult[]> {
  const f = opts.fetchImpl ?? fetch;
  const base = baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = { 'user-agent': 'rtm-smoke/1', 'cache-control': 'no-cache' };
  if (opts.bypass) headers['x-vercel-protection-bypass'] = opts.bypass;
  return Promise.all(SMOKE_PATHS.map(async (path): Promise<SmokeResult> => {
    const t0 = Date.now();
    try {
      const r = await f(base + path, { headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) });
      return { path, status: r.status, ms: Date.now() - t0 };
    } catch (e) {
      return { path, status: null, ms: Date.now() - t0, error: String((e as Error)?.message ?? e) };
    }
  }));
}

// reprovado = 5xx ou sem resposta (timeout, DNS, conexão)
export const smokeFailed = (r: SmokeResult) => r.status === null || r.status >= 500;

// roda só como script (o teste importa as funções sem disparar o smoke)
const isMain = /(^|[\\/])smoke-api\.mts$/.test(process.argv[1] ?? '');
if (isMain) {
  const base = process.argv[2] ?? process.env.BASE_URL;
  if (!base) {
    console.error('uso: BASE_URL=https://<preview>.vercel.app npx tsx scripts/smoke-api.mts');
    process.exit(2);
  }
  const results = await smokeApi(base, { bypass: process.env.VERCEL_AUTOMATION_BYPASS_SECRET });
  for (const r of results) {
    const mark = smokeFailed(r) ? 'FALHOU' : 'ok';
    console.log(`${mark.padEnd(6)} ${String(r.status ?? '---').padEnd(4)} ${String(r.ms).padStart(5)}ms  ${r.path}${r.error ? `  (${r.error})` : ''}`);
  }
  const bad = results.filter(smokeFailed);
  if (bad.length) {
    console.error(`\nsmoke reprovado: ${bad.length} rota(s) com 5xx/sem resposta em ${base}`);
    process.exit(1);
  }
  console.log(`\nsmoke ok em ${base}`);
}
