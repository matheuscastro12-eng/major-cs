// PRÓXIMA AÇÃO do Início: a única ação principal da tela (e o CONTINUAR do
// shell), decidida por regra pura e testável (scripts/test-home-next.mts).
//
// Prioridade (a primeira que vale ganha):
//   1. Major da campanha em andamento (Modo Major · Jogar) ............ Continuar
//   2. Major avulso do Draft em andamento (save da sessão) ............ Continuar
//   3. sequência do Diário em risco (ontem jogou, hoje ainda não) ..... Salvar a sequência
//   4. janela do Major no ar e pick'em incompleto que ainda vale ...... Fazer meu pick'em
//      ou, depois da trava, palpite valendo e resultado oficial já
//      publicado ......................................................... Conferir meu placar
//   5. Diário de hoje com desafio pendente ............................ Jogar o Diário
//   6. palpite valendo, ainda sem resultado publicado ................. Conferir meu placar
//   7. Carreira (continuar a salva ou começar) ........................ Carreira
//   8. Draft novo (só se a Carreira não existir nesta sessão)
// Depois da trava do Stage 1 (23/11, 13h de Brasília) o "Fazer meu pick'em" só
// aparece se o palpite ainda pode entrar no placar (pickemStanding 'partial');
// sem palpite que conte ('out'), o pick'em some e o Modo Major segue pelas
// outras ações (a campanha, o Tile e o bloco do Major).
// As secundárias são as próximas da mesma fila, sem repetir destino (a
// sequência e o Diário abrem a mesma tela; a campanha e o pick'em também).
//
// Leve de propósito: o Início não importa o JSON dos 32 times nem o motor do
// Major. O pick'em e a campanha são lidos crus do localStorage, com as mesmas
// chaves de MajorSingaporeScreen.tsx e MajorPlay.tsx (o teste trava as chaves).

/** chave do pick'em em components/major/MajorSingaporeScreen.tsx */
export const MAJOR_PICKS_KEY = 'rtm-major-sg-picks-v1';
/** chave da campanha em components/major/MajorPlay.tsx */
export const MAJOR_CAMPAIGN_KEY = 'rtm-major-sg-campaign-v1';
/** chave das fotos do palpite em cada trava (state/pickSnapshots.ts) */
export const MAJOR_SNAPSHOTS_KEY = 'rtm-major-sg-pick-snapshots-v1';

// ── pick'em ────────────────────────────────────────────────────────────────

export interface PickemProgress {
  /** etapas fechadas: Stage 1, Stage 2, Stage 3 (8 classificados cada) e a chave (7 vencedores) */
  steps: number;
  total: 4;
  complete: boolean;
}

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []);

/** cada parte do palpite fechada ou não: Stage 1, Stage 2, Stage 3 e a chave */
export type PickParts = [boolean, boolean, boolean, boolean];

/** as 4 partes do palpite salvo, com o critério de picksComplete (engine/majorSingapore.ts) */
export function pickPartsFromRaw(raw: string | null): PickParts {
  let parsed: unknown = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { /* lixo no storage = nada feito */ }
  const o: Record<string, unknown> = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  const bracket = Array.isArray(o.bracket) ? o.bracket.slice(0, 7) : [];
  return [
    strList(o.s1).length >= 8,
    strList(o.s2).length >= 8,
    strList(o.s3).length >= 8,
    bracket.length === 7 && bracket.every((x) => typeof x === 'string' && x.length > 0),
  ];
}

/** mesmo critério de picksComplete (engine/majorSingapore.ts), sem importar o motor */
export function pickemFromRaw(raw: string | null): PickemProgress {
  const steps = pickPartsFromRaw(raw).filter(Boolean).length;
  return { steps, total: 4, complete: steps === 4 };
}

// ── o palpite ainda conta para o placar? ──────────────────────────────────
// O placar pontua cada parte pela FOTO do palpite tirada na trava dela
// (engine/pickemScore.ts → scoredPicks) e só mostra pontos com o palpite
// pontuado inteiro. Aqui a mesma conta sem a lista de times: a foto é o código
// do encodePicks, e no código cada time vazio é '_' (Stage = 8 letras, chave = 7).

type PickPart = 's1' | 's2' | 's3' | 'playoffs';
const PARTS: readonly PickPart[] = ['s1', 's2', 's3', 'playoffs'];
/** foto de cada parte já travada → partes completas naquela foto */
export type SnapParts = Partial<Record<PickPart, PickParts>>;

/** partes completas no código de um palpite (formato do encodePicks); null se não for um código */
export function pickPartsFromCode(code: string): PickParts | null {
  const m = /^[0-9a-z]{4}\.([0-9a-v_]{31})(?:\.[0-9a-v_]{12})?$/.exec(code.trim().toLowerCase());
  if (!m) return null;
  const full = (from: number, n: number) => !m[1].slice(from, from + n).includes('_');
  return [full(0, 8), full(8, 8), full(16, 8), full(24, 7)];
}

/** fotos cruas do navegador (state/pickSnapshots.ts: { s1: código, … }) */
export function snapPartsFromRaw(raw: string | null): SnapParts {
  let o: unknown;
  try { o = raw ? JSON.parse(raw) : null; } catch { return {}; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
  const out: SnapParts = {};
  for (const k of PARTS) {
    const code = (o as Record<string, unknown>)[k];
    const parts = typeof code === 'string' ? pickPartsFromCode(code) : null;
    if (parts) out[k] = parts;
  }
  return out;
}

/**
 * - 'open': antes da trava do Stage 1 (tudo vale);
 * - 'in': toda parte fechada (as travadas na foto da trava): o placar mostra pontos;
 * - 'partial': as travadas estavam fechadas, mas falta fechar uma parte que ainda não travou;
 * - 'out': alguma parte travou aberta: esse palpite não entra mais no placar.
 * Parte travada sem foto usa o palpite salvo: a foto sai na 1ª visita ao Modo
 * Major depois da trava e antes de qualquer edição, então sem visita ele é o da trava.
 */
export type PickemStanding = 'open' | 'in' | 'partial' | 'out';

export function pickemStanding(current: PickParts, snaps: SnapParts, locks: Readonly<Record<PickPart, number>>, nowMs: number): PickemStanding {
  if (nowMs < locks.s1) return 'open';
  let partial = false;
  for (let i = 0; i < PARTS.length; i++) {
    const k = PARTS[i];
    const locked = nowMs >= locks[k];
    const src = locked ? snaps[k] ?? current : current;
    if (src[i]) continue;
    if (locked) return 'out';
    partial = true;
  }
  return partial ? 'partial' : 'in';
}

// ── campanha do Modo Major ────────────────────────────────────────────────

export interface MajorRunBrief {
  /** 1–3 = Stage (suíço, 3 vitórias classificam, 3 derrotas eliminam) · 4 = playoffs */
  phase: 1 | 2 | 3 | 4;
  wins: number;
  losses: number;
  /** a campanha acabou (eliminado ou campeão): não é mais "continuar" */
  done: boolean;
}

interface RawSeries { phase?: unknown; label?: unknown; winner?: unknown }

/**
 * Resumo da campanha salva. Sem os 32 times não dá pra rodar campaignView, mas
 * o fim é dedutível das séries do próprio time: caiu no suíço (3 derrotas no
 * stage), perdeu nos playoffs (eliminação simples) ou venceu a final.
 */
export function majorRunFromRaw(raw: string | null): MajorRunBrief | null {
  let o: { v?: unknown; teamId?: unknown; played?: unknown } | null;
  try { o = raw ? JSON.parse(raw) : null; } catch { return null; }
  if (!o || typeof o !== 'object' || o.v !== 1 || typeof o.teamId !== 'string' || !Array.isArray(o.played)) return null;
  const team = o.teamId;
  const played = (o.played as RawSeries[]).filter((p) => p && typeof p === 'object' && [1, 2, 3, 4].includes(p.phase as number));
  const wins = played.filter((p) => p.winner === team).length;
  const losses = played.length - wins;
  const last = played[played.length - 1];
  if (!last) return { phase: 1, wins: 0, losses: 0, done: false }; // time escolhido, 1ª série pendente
  const phase = last.phase as MajorRunBrief['phase'];
  let done: boolean;
  if (phase === 4) done = last.winner !== team || last.label === 'F';
  else done = played.filter((p) => p.phase === phase && p.winner !== team).length >= 3;
  return { phase, wins, losses, done };
}

/** leitura do navegador (try/catch: modo privado ou storage cheio não quebram o Início) */
export function readMajorLocal(): { pickem: PickemProgress; run: MajorRunBrief | null; parts: PickParts; snaps: SnapParts } {
  const get = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
  const picks = get(MAJOR_PICKS_KEY);
  return {
    pickem: pickemFromRaw(picks),
    run: majorRunFromRaw(get(MAJOR_CAMPAIGN_KEY)),
    parts: pickPartsFromRaw(picks),
    snaps: snapPartsFromRaw(get(MAJOR_SNAPSHOTS_KEY)),
  };
}

// ── a regra ───────────────────────────────────────────────────────────────

export type HomeActionId = 'major-run' | 'draft-run' | 'streak' | 'pickem' | 'placar' | 'daily' | 'career' | 'draft-new';
/** a tela que a ação abre (duas ações com o mesmo destino não aparecem juntas) */
export type HomeTarget = 'major' | 'resume' | 'daily' | 'career' | 'draft';

export interface HomeAction { id: HomeActionId; target: HomeTarget }

export interface HomeNextInput {
  majorRun: MajorRunBrief | null;
  /** Major avulso do Draft salvo na sessão (App: savedSession.tournament) */
  draftRun: { name: string; phase: string } | null;
  streak: { atRisk: boolean; current: number };
  /** majorPromoOn(): da campanha até o fim do dia da final */
  majorWindow: boolean;
  pickem: PickemProgress;
  /** o palpite ainda conta para o placar (pickemStanding); sem o campo = 'open' (antes da trava) */
  standing?: PickemStanding;
  /** já saiu resultado oficial de alguma parte (data/majorLive.ts) */
  resultOut?: boolean;
  daily: { done: number; total: number };
  /** destinos disponíveis nesta sessão (as props do Home são opcionais); o Draft sempre existe */
  can: { major: boolean; resume: boolean; daily: boolean; career: boolean };
}

export interface HomeNextPlan { primary: HomeAction; secondary: HomeAction[] }

const TARGET: Record<HomeActionId, HomeTarget> = {
  'major-run': 'major', 'draft-run': 'resume', streak: 'daily', pickem: 'major', placar: 'major', daily: 'daily', career: 'career', 'draft-new': 'draft',
};

export function homeQueue(i: HomeNextInput): HomeActionId[] {
  const q: HomeActionId[] = [];
  if (i.can.major && i.majorRun && !i.majorRun.done) q.push('major-run');
  if (i.can.resume && i.draftRun) q.push('draft-run');
  if (i.can.daily && i.streak.atRisk && i.streak.current > 0) q.push('streak');
  const major = i.can.major && i.majorWindow;
  const standing = i.standing ?? 'open';
  if (major && (standing === 'open' || standing === 'partial') && !i.pickem.complete) q.push('pickem');
  if (major && standing === 'in' && i.resultOut) q.push('placar');
  if (i.can.daily && i.daily.done < i.daily.total) q.push('daily');
  if (major && standing === 'in' && !i.resultOut) q.push('placar');
  if (i.can.career) q.push('career');
  q.push('draft-new');
  return q;
}

export function nextAction(i: HomeNextInput, maxSecondary = 2): HomeNextPlan {
  const seen = new Set<HomeTarget>();
  const out: HomeAction[] = [];
  for (const id of homeQueue(i)) {
    const target = TARGET[id];
    if (seen.has(target)) continue;
    seen.add(target);
    out.push({ id, target });
  }
  const [primary, ...rest] = out;
  return { primary, secondary: rest.slice(0, Math.max(0, maxSecondary)) };
}
