// FLAG MATCH_ENGINE — escolhe o motor de partida.
//   v1 = motor antigo (engine/match.ts): round decidido no nível do TIME e
//        kills distribuídas depois do resultado.
//   v2 = motor por DUELOS (engine/match2/): o round é uma cadeia de duelos
//        entre jogadores lendo `attrsOf(p)`; as estatísticas emergem dos duelos.
//
// Ordem de precedência (a primeira que existir vence):
//   1. `opts.engine` na chamada (sessões persistidas travam o motor em que nasceram);
//   2. `setMatchEngine()` em runtime (harness de calibração, comparação lado a lado);
//   3. variável de ambiente `MATCH_ENGINE` (Node/testes) ou `VITE_MATCH_ENGINE` (build);
//   4. padrão: v2.
// Reverter em produção = build com VITE_MATCH_ENGINE=v1.

import { envStr } from '../matchShared';

export type MatchEngine = 'v1' | 'v2';
export const DEFAULT_MATCH_ENGINE: MatchEngine = 'v2';

let override: MatchEngine | null = null;

export function setMatchEngine(engine: MatchEngine | null): void {
  override = engine;
}

const parse = (v: string | undefined): MatchEngine | null => (v === 'v1' || v === 'v2' ? v : null);

function buildEnv(): string | undefined {
  // import.meta.env só existe no bundle do Vite; no Node (tsx) é indefinido.
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_MATCH_ENGINE;
}

export function getMatchEngine(): MatchEngine {
  return override ?? parse(envStr('MATCH_ENGINE')) ?? parse(buildEnv()) ?? DEFAULT_MATCH_ENGINE;
}

export function resolveEngine(explicit?: MatchEngine | null): MatchEngine {
  return parse(explicit ?? undefined) ?? getMatchEngine();
}
