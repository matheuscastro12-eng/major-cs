// Forma do CLUBE (Brasval gap #7) — computeTeamForm(save, teamId) → 0-100.
//
// NÃO confundir com src/engine/career/form.ts: aquele é a forma do JOGADOR
// (janela de ratings por série). Este módulo mede a forma da ORGANIZAÇÃO a
// partir de RESULTADOS — colocações dos últimos splits, campanha do evento
// vivo e caixa — e é a fundação do mercado vivo de IA:
//   - #23 tickAIMarketActivity: form >= TEAM_FORM_PASSIVE (55) → clube passivo
//     no mercado; form < TEAM_FORM_CRISIS (40) → hiperativo ("time que afundou
//     no Major reforça, campeão fica quieto").
//   - #14 decideOffer/formFactor: time em alta resiste a vender; em baixa
//     libera jogadores.
// (Os consumidores acima chegam em iterações futuras — aqui só a fundação.)
//
// Escala 0-100, neutro = 50. Fatores (todos clampados, soma clampada 0-100):
//   HISTÓRICO  ±30  · colocações dos últimos 3 splits (save.history — só a org
//                     do usuário tem histórico; peso 3/2/1, mais recente pesa mais)
//   EVENTO VIVO ±20 · win-rate na liga/circuito atual (qualquer time em
//                     save.league com ≥2 jogos)
//   DRIFT (IA) ±24  · proxy de histórico pros clubes de IA: save.aiDrift é o
//                     delta de força ACUMULADO por forma sustentada (−6..+6),
//                     o único sinal multi-split REAL que o save guarda pra IA
//   CAIXA      −10  · penalidade por caixa negativo. Caixa de clube SÓ existe
//                     pra org do usuário (save.budget); a IA não tem finanças
//                     modeladas, então o fator é pulado pra ela (documentado
//                     no roadmap como condicional).
//
// Puro e determinístico: nada de Date.now/Math.random. Cache por save (WeakMap):
// o save é imutável entre setSave()s, então chamadas repetidas no mesmo
// split/rodada (ex.: uma por jogador no mercado) custam um lookup.

import type { League } from '../league';

// espelho estrutural do SplitRecord de CareerScreen.tsx (só os campos usados
// aqui) — evita import engine → components. Compatível por forma.
export interface ClubSplitResult {
  position: number;
  wins: number;
  losses: number;
  champion: boolean;
  major?: { placement: string; champion: boolean };
}

// subconjunto estrutural do CareerSave que a forma precisa (compatível por forma)
export interface TeamFormSave {
  split: number;
  budget?: number;
  history?: ClubSplitResult[];
  league?: League | null;
  aiDrift?: Record<string, number>;
}

// limiares que os consumidores (#23/#14) vão usar — exportados pra não virarem
// números mágicos espalhados. >=55 passivo no mercado; <40 modo crise.
export const TEAM_FORM_PASSIVE = 55;
export const TEAM_FORM_CRISIS = 40;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// pontos por placement no Major (PlacementCode do engine/swiss). Cair na Swiss
// de um Major é resultado RUIM pra quem chegou lá — daí o negativo.
const MAJOR_SCORE: Record<string, number> = {
  champion: 0.6, runnerup: 0.4, semi: 0.25, quarters: 0.15, playoffs: 0.05, swiss: -0.15,
};

// score −1..+1 de UM split encerrado da org (colocação + win-rate + Major)
function splitScore(r: ClubSplitResult): number {
  let s = 0;
  const games = r.wins + r.losses;
  if (games > 0) s += ((r.wins / games) - 0.5) * 1.2; // campanha da fase de liga
  if (r.champion) s += 0.5;                            // título do circuito
  else if (r.position <= 2) s += 0.3;
  else if (r.position <= 4) s += 0.15;
  else if (r.position > 8) s -= 0.3;                   // fundo da tabela
  if (r.major) s += MAJOR_SCORE[r.major.placement] ?? 0;
  return clamp(s, -1, 1);
}

// HISTÓRICO ±30: média ponderada (3/2/1) dos últimos 3 splits do histórico
function historyFactor(history: ClubSplitResult[] | undefined): number | null {
  const recent = (history ?? []).slice(-3);
  if (recent.length === 0) return null; // sem histórico → fator não se aplica
  // mais recente pesa mais: [..., antigo, meio, último] → pesos 1/2/3
  let sum = 0; let wsum = 0;
  recent.forEach((r, i) => {
    const w = i + 1 + (3 - recent.length); // 1 split → peso 3; 2 → 2/3; 3 → 1/2/3
    sum += splitScore(r) * w;
    wsum += w;
  });
  return (sum / wsum) * 30;
}

// EVENTO VIVO ±20: win-rate do time na liga atual (≥2 jogos pra não ser ruído)
function liveEventFactor(league: League | null | undefined, teamId: string): number {
  const t = league?.teams.find((x) => x.id === teamId);
  if (!t) return 0;
  const games = t.wins + t.losses;
  if (games < 2) return 0;
  return ((t.wins / games) - 0.5) * 2 * 20;
}

// forma 0-100 de UM clube. Prefira computeAllTeamForms/formOf pra loops.
export function computeTeamForm(save: TeamFormSave, teamId: string): number {
  let form = 50;
  // histórico real de splits só existe pra org do usuário (id 'user' na liga)
  const hist = teamId === 'user' ? historyFactor(save.history) : null;
  if (hist != null) {
    form += hist;
  } else {
    // IA: o drift acumulado (−6..+6) é o histórico multi-split que temos
    form += clamp(save.aiDrift?.[teamId] ?? 0, -6, 6) * 4;
  }
  form += liveEventFactor(save.league, teamId);
  // caixa: modelado só pra org do usuário — IA não tem finanças (fator pulado)
  if (teamId === 'user' && (save.budget ?? 0) < 0) form -= 10;
  return Math.round(clamp(form, 0, 100));
}

// cache por split: o save é recriado a cada setSave, então cachear pelo objeto
// (WeakMap) dá "grátis" o requisito do roadmap de não recalcular por jogador —
// todas as chamadas no mesmo split/rodada batem no mesmo Record.
const formCache = new WeakMap<TeamFormSave, Record<string, number>>();

// forma de TODOS os clubes conhecidos do save (liga atual + user + quem tem
// drift), computada uma vez e cacheada. Use nos consumidores de mercado.
export function computeAllTeamForms(save: TeamFormSave): Record<string, number> {
  const hit = formCache.get(save);
  if (hit) return hit;
  const ids = new Set<string>(['user']);
  for (const t of save.league?.teams ?? []) ids.add(t.id);
  for (const id of Object.keys(save.aiDrift ?? {})) ids.add(id);
  const out: Record<string, number> = {};
  for (const id of ids) out[id] = computeTeamForm(save, id);
  formCache.set(save, out);
  return out;
}

// forma de um clube passando pelo cache (atalho pros callsites por-jogador)
export function formOf(save: TeamFormSave, teamId: string): number {
  return computeAllTeamForms(save)[teamId] ?? computeTeamForm(save, teamId);
}

// leitura em 3 faixas pra UI (chip no perfil do rival). Mesmos limiares que o
// mercado usa — o que o usuário lê é o que o engine decide.
export interface TeamFormBand {
  band: 'alta' | 'estavel' | 'crise';
  label: string; // PT-BR pronto pra UI
  color: string; // token CSS do projeto (mesma paleta do form.ts de jogador)
}
export function teamFormBand(form: number): TeamFormBand {
  if (form >= TEAM_FORM_PASSIVE) return { band: 'alta', label: 'Em alta', color: 'var(--green-bright)' };
  if (form < TEAM_FORM_CRISIS) return { band: 'crise', label: 'Em crise', color: 'var(--red)' };
  return { band: 'estavel', label: 'Estável', color: 'var(--muted)' };
}
