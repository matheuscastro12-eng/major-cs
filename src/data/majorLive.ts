// MODO "AO VIVO" do PGL Major Singapore (24/11 a 13/12/2026): qual parte do
// Major está rolando hoje e quais partes já têm resultado oficial publicado.
// "Ao vivo" é o Stage do dia por data fixa + o resultado do JSON; nada de API
// externa nem placar em tempo real.
//
// LEVE de propósito: o Início e a landing (chunk inicial) importam isto. Lê só
// o JSON de resultados (pequeno), nunca o dos 32 times nem o motor do Major.
// Puro (o tempo entra por parâmetro); testado em scripts/test-major-live.mts.
//
// FRONTEIRAS (as mesmas das travas do pick'em, data/majorResults.ts →
// PICKEM_LOCKS, que o teste confere): meia-noite de Singapura (UTC+8) do 1º
// dia de cada parte. Stage 1 = 24/11 e playoffs = 10/12 (event.start /
// event.playoffsStart do major-singapore-2026.json); Stage 2 = 28/11 e
// Stage 3 = 02/12 pelo HLTV (hltv.org/events/9303). O fim do Stage 3 NÃO é
// inventado: de 02/12 a 10/12 é "Stage 3" até o resultado do Stage 3 entrar no
// JSON; depois, "Playoffs em 10/12". A final é MAJOR_SG_FINAL_DAY_MS (13/12
// 00h de Brasília, o mesmo "Hoje é a final" do Início) e o fim é
// MAJOR_SG_PROMO_ENDS_MS (a vitrine sai do ar no fim do dia 13/12).
import raw from './major-singapore-2026-results.json';
import { MAJOR_SG_FINAL_DAY_MS, MAJOR_SG_PROMO_ENDS_MS } from './majorWindow';

export type LivePart = 's1' | 's2' | 's3' | 'playoffs';
export const LIVE_PARTS: readonly LivePart[] = ['s1', 's2', 's3', 'playoffs'];

const sgMidnight = (day: string) => Date.parse(`${day}T00:00:00+08:00`);
/** trava de cada parte (= PICKEM_LOCKS): s1 é 23/11 às 13h de Brasília */
export const LIVE_LOCKS: Readonly<Record<LivePart, number>> = {
  s1: sgMidnight('2026-11-24'),
  s2: sgMidnight('2026-11-28'),
  s3: sgMidnight('2026-12-02'),
  playoffs: sgMidnight('2026-12-10'),
};

// ── resultado publicado ────────────────────────────────────────────────────

/** o que já saiu no JSON: cada Stage (8 classificados + fonte) e até onde foram os playoffs */
export interface Published {
  stages: [boolean, boolean, boolean];
  /** rodada mais recente dos playoffs com resultado (null = nenhuma) */
  playoffs: null | 'qf' | 'sf' | 'final';
}

export const NOTHING_PUBLISHED: Published = { stages: [false, false, false], playoffs: null };

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const hasSource = (o: Record<string, unknown>) => typeof o.source === 'string' && o.source.trim() !== '';
const len = (x: unknown) => (Array.isArray(x) ? x.length : 0);

/**
 * Leitura rasa do JSON de resultados (sem a lista de times, então sem validar
 * os ids): um Stage conta como publicado com fonte e 8 classificados; os
 * playoffs, com fonte e as 4 quartas (depois semis e campeão). O validador de
 * verdade (validateMajorResults) e o teste do repo barram arquivo inválido no
 * CI, então o que passa aqui é o mesmo que o placar pontua (o teste confere).
 */
export function publishedFrom(file: unknown): Published {
  if (!isObj(file)) return NOTHING_PUBLISHED;
  const stage = (k: string) => {
    const s = file[k];
    return isObj(s) && hasSource(s) && len(s.qualified) === 8;
  };
  const po = file.playoffs;
  let playoffs: Published['playoffs'] = null;
  if (isObj(po) && hasSource(po) && len(po.qf) === 4) {
    const champ = typeof po.champion === 'string' && po.champion !== '';
    playoffs = len(po.sf) === 2 ? (champ ? 'final' : 'sf') : 'qf';
  }
  return { stages: [stage('stage1'), stage('stage2'), stage('stage3')], playoffs };
}

/** o que está publicado no arquivo do repo agora */
export const PUBLISHED: Published = publishedFrom(raw);

/** o mesmo recorte da prévia ?placar=demoN do placar (1–3 = até o Stage N; 4 quartas; 5 semis; 6 campeão) */
export function publishedDemo(n: 1 | 2 | 3 | 4 | 5 | 6): Published {
  return {
    stages: [n >= 1, n >= 2, n >= 3],
    playoffs: n >= 6 ? 'final' : n >= 5 ? 'sf' : n >= 4 ? 'qf' : null,
  };
}

/** `?placar=demoN` → N, ou null */
export function demoParam(search: string): 1 | 2 | 3 | 4 | 5 | 6 | null {
  const m = /^demo([1-6])$/.exec(new URLSearchParams(search).get('placar') ?? '');
  return m ? (Number(m[1]) as 1 | 2 | 3 | 4 | 5 | 6) : null;
}

/**
 * O publicado que a tela usa. Só em `npm run dev`, ?placar=demoN finge o
 * resultado como a prévia do placar (MajorScoreboard.tsx); em produção é sempre
 * o arquivo do repo.
 */
export function livePublished(): Published {
  const env = (import.meta as { env?: { DEV?: boolean } }).env;
  if (env?.DEV) {
    try {
      const n = demoParam(window.location.search);
      if (n) return publishedDemo(n);
    } catch { /* sem window */ }
  }
  return PUBLISHED;
}

export function anyPublished(p: Published): boolean {
  return p.stages.some(Boolean) || p.playoffs !== null;
}

/** a parte mais recente com resultado (o destaque "Saiu o resultado do…") */
export type LatestResult = { kind: 'stage'; n: 1 | 2 | 3 } | { kind: 'qf' } | { kind: 'sf' } | { kind: 'final' };

export function latestResult(p: Published): LatestResult | null {
  if (p.playoffs) return { kind: p.playoffs };
  for (const n of [3, 2, 1] as const) if (p.stages[n - 1]) return { kind: 'stage', n };
  return null;
}

// ── a parte do dia ─────────────────────────────────────────────────────────

export type LiveStage =
  | { kind: 'before' }
  | { kind: 'stage'; n: 1 | 2 | 3 }
  /** Stage 3 com resultado publicado, antes de 10/12: "Playoffs em 10/12" */
  | { kind: 'gap' }
  | { kind: 'playoffs' }
  | { kind: 'final' }
  | { kind: 'after' };

export function liveStage(nowMs: number, published: Published): LiveStage {
  if (nowMs >= MAJOR_SG_PROMO_ENDS_MS) return { kind: 'after' };
  if (nowMs >= MAJOR_SG_FINAL_DAY_MS) return { kind: 'final' };
  if (nowMs >= LIVE_LOCKS.playoffs) return { kind: 'playoffs' };
  if (nowMs >= LIVE_LOCKS.s3) return published.stages[2] ? { kind: 'gap' } : { kind: 'stage', n: 3 };
  if (nowMs >= LIVE_LOCKS.s2) return { kind: 'stage', n: 2 };
  if (nowMs >= LIVE_LOCKS.s1) return { kind: 'stage', n: 1 };
  return { kind: 'before' };
}

// ── "veja seus pontos": abrir o Modo Major já no placar ─────────────────────
// O Início e a landing pedem; o placar (MajorScoreboard) consome uma vez ao
// montar e rola até ele. Estado de módulo: vale só dentro da mesma aba.
let placarFocus = false;
export function requestPlacarFocus(): void { placarFocus = true; }
export function takePlacarFocus(): boolean {
  const f = placarFocus;
  placarFocus = false;
  return f;
}
