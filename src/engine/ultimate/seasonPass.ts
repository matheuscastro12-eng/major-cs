// Ultimate Squad — Passe de Temporada (season pass). Puro, sem DOM/save — a
// store (src/state/ultimate.ts) aplica XP nas ações e paga as recompensas.
// Estilo dos módulos irmãos (seasonRewards.ts / weeklyMissions.ts).
//
// ── Curva de XP ──────────────────────────────────────────────────────────────
// 35 níveis. XP pra ir do nível N-1 → N: 25 + (N-1)*5.
// Acumulado até o nível n: cum(n) = 2.5n² + 22.5n (sempre inteiro: n(n+9) é par).
// Total do passe (nível 35): 3.850 XP.
// (O rascunho original pedia 100 + (N-1)*20 = 15.400 XP totais, mas com as
// fontes de XP abaixo um mês ATIVO gera ~3.1k XP — a curva foi dividida por 4,
// mantendo as fontes nos valores "públicos" do design.)
//
// ── Fontes de XP (PASS_XP) e a matemática do mês ────────────────────────────
// Mês ATIVO (40 ranqueadas 60% WR + 25 dailies + 4 semanais + 8 objetivos +
// 6 SBCs + 10 packs):
//   24×40 + 16×15 = 1.200 (ranqueadas)
//   25×30        =   750 (daily login)
//   4×80         =   320 (semanais)
//   8×60         =   480 (objetivos)
//   6×50         =   300 (SBCs)
//   10×10        =   100 (packs, sob o cap diário)
//   total 3.150 XP → nível 31 (cum(31)=3.100; cum(32)=3.280). Missões diárias
//   (20 XP cada, fora da simulação) empurram o ativo de verdade até o 35.
// Mês CASUAL (10 ranqueadas 50% + 10 amistosos 50% + 12 dailies + 2 semanais +
// 2 objetivos + 1 SBC + 3 packs):
//   275 + 140 + 360 + 160 + 120 + 50 + 30 = 1.135 XP → nível 17
//   (cum(17)=1.105; cum(18)=1.215).
//
// ── Cap de XP de pack ────────────────────────────────────────────────────────
// XP de pack (10) só conta pros 5 PRIMEIROS packs abertos no dia
// (PASS_PACK_XP_DAILY_CAP) — sem isso, comprar packs viraria compra de nível
// (buy-to-level). O contador diário vive no PassState (packXpDay/packXpCount).
//
// ── Economia (soma de credits do passe) ─────────────────────────────────────
// FREE:    100/200/300/400/500/600 por faixa de 6 níveis, menos os níveis de
//          item (10/20/30) → 10.900 credits.
// PREMIUM: 200/350/500/650/800/950 por faixa, menos os níveis de item
//          (15/25/35) → 17.500 credits. (v1 custava 15.000 credits → líquido
//          +2.500; v2 é dinheiro real R$ 30,00, então os 17.500 entram cheios —
//          aceitável: é conteúdo PAGO, mesma lógica da compra de coins.)
// TOTAL:   28.400 credits ≈ 1.0× o capstone mensal da ladder de temporada
//          (Elite = 28.000; ladder completa = 54.000) — dentro do teto de ~2×
//          pedido pra não inundar a economia. Itens de referência: pack prata
//          6k, pack ouro 14k, pack promo 25k.

import type { UltRarity } from './rarities';

export const PASS_MAX_LEVEL = 35;
/**
 * @deprecated v1 cobrava 15.000 credits pelo premium. Desde a v2 o desbloqueio
 * é dinheiro real (R$ 30,00 via Pix/Stripe) — este valor NÃO é mais comprável;
 * fica exportado só como referência histórica do ledger (spend src:'pass-premium').
 */
export const PASS_PREMIUM_COST = 15000; // em credits (v1, legado)

// premiumVia: 'credits' = compra legada da v1 (grandfathered — quem pagou
// 15.000 credits mantém o premium); 'coins' = compra em DINHEIRO REAL (R$ 30,00
// Pix/Stripe). Renomear 'coins' → 'paid' exigiria migrar saves persistidos e o
// sanitizador do codec — mantemos o valor e documentamos o significado.
export type PassPremiumMethod = 'credits' | 'coins';

// fontes de XP do passe — XP é um contador NOVO (não toca credits).
export const PASS_XP = {
  rankedWin: 40,
  rankedLoss: 15,
  casualWin: 20,
  casualLoss: 8,
  gauntletWin: 25,   // por estágio vencido do Gauntlet
  daily: 30,         // resgate da recompensa diária de login
  mission: 20,       // cada missão DIÁRIA rotativa resgatada
  weekly: 80,        // cada missão SEMANAL resgatada
  objective: 60,
  sbc: 50,
  pack: 10,          // sob PASS_PACK_XP_DAILY_CAP
} as const;
export type PassXpSource = keyof typeof PASS_XP;

export const PASS_PACK_XP_DAILY_CAP = 5; // packs que dão XP por dia

// ── estado persistido (dentro de UltimateProfile.pass) ──────────────────────
export interface PassState {
  seasonId: number;            // = profile.season.n — reset no rollover
  xp: number;
  premium: boolean;
  premiumVia: PassPremiumMethod | null;
  claimedFree: number[];       // níveis já resgatados na trilha grátis
  claimedPremium: number[];    // idem na trilha premium
  packXpDay: string | null;    // dateKey do dia do contador de XP de pack
  packXpCount: number;         // packs que JÁ deram XP nesse dia
}

export function defaultPassState(seasonId: number): PassState {
  return {
    seasonId,
    xp: 0,
    premium: false,
    premiumVia: null,
    claimedFree: [],
    claimedPremium: [],
    packXpDay: null,
    packXpCount: 0,
  };
}

// garante um PassState válido pra temporada corrente: nulo ou de temporada
// antiga → zera (premium NÃO carrega entre temporadas). Self-heal: funciona
// mesmo se o rollover aconteceu por outro caminho.
export function ensurePass(pass: PassState | null | undefined, seasonId: number): PassState {
  if (!pass || pass.seasonId !== seasonId) return defaultPassState(seasonId);
  return pass;
}

// ── curva ───────────────────────────────────────────────────────────────────
// XP necessário pra ir do nível n-1 → n (n em 1..35).
export function xpForLevel(n: number): number {
  if (n < 1 || n > PASS_MAX_LEVEL) return 0;
  return 25 + (n - 1) * 5;
}

// XP acumulado do zero até completar o nível n. cum(n) = 2.5n² + 22.5n.
export function totalXpForLevel(n: number): number {
  const k = Math.max(0, Math.min(PASS_MAX_LEVEL, Math.floor(n)));
  return (5 * k * k + 45 * k) / 2;
}

// nível atingido com `xp` (0..35).
export function levelForXp(xp: number): number {
  let lvl = 0;
  for (let n = 1; n <= PASS_MAX_LEVEL; n++) {
    if (xp >= totalXpForLevel(n)) lvl = n;
    else break;
  }
  return lvl;
}

// aplica XP de uma fonte. `day` (dateKey) alimenta o cap diário de pack-XP.
// Retorna o MESMO objeto se nada mudou (pack capado) — a store usa isso pra
// evitar persist desnecessário.
export function passAddXp(pass: PassState, source: PassXpSource, day: string): PassState {
  const amount = PASS_XP[source];
  if (source === 'pack') {
    const count = pass.packXpDay === day ? pass.packXpCount : 0;
    if (count >= PASS_PACK_XP_DAILY_CAP) return pass;
    return { ...pass, xp: pass.xp + amount, packXpDay: day, packXpCount: count + 1 };
  }
  return { ...pass, xp: pass.xp + amount };
}

// ── recompensas ─────────────────────────────────────────────────────────────
export type PassTrack = 'free' | 'premium';

export interface PassReward {
  credits?: number;
  pack?: string;       // id de PackDef (packs.ts): 'silver' | 'gold' | 'promo'
  card?: UltRarity;    // carta aleatória dessa raridade (mesmo funil dos claims)
  title?: boolean;     // título exclusivo passTitleSlug(seasonId) (premium 35)
}

export interface PassLevelDef {
  level: number;
  free: PassReward;
  premium: PassReward; // EXTRA (soma-se ao free; resgates independentes por trilha)
}

// credits por faixa de 6 níveis (índice floor((n-1)/6), clampado na última).
const FREE_CREDITS = [100, 200, 300, 400, 500, 600];
const PREMIUM_CREDITS = [200, 350, 500, 650, 800, 950];

// níveis-âncora com item no lugar de credits (documentados no header).
const FREE_ITEM: Record<number, PassReward> = {
  10: { pack: 'silver' },       // Pacote Prata (garante 1 ouro) — 6k de valor
  20: { pack: 'gold' },         // Pacote Ouro — 14k de valor
  30: { card: 'rareGold' },     // Ouro Raro garantido
};
const PREMIUM_ITEM: Record<number, PassReward> = {
  15: { pack: 'promo' },        // Pacote Promo — 25k de valor
  25: { card: 'elite' },        // carta Elite garantida
  35: { card: 'tots', title: true }, // TOTS + título exclusivo da temporada
};

let _levels: PassLevelDef[] | null = null;

export function passLevels(): PassLevelDef[] {
  if (_levels) return _levels;
  const out: PassLevelDef[] = [];
  for (let n = 1; n <= PASS_MAX_LEVEL; n++) {
    const band = Math.min(5, Math.floor((n - 1) / 6));
    out.push({
      level: n,
      free: FREE_ITEM[n] ?? { credits: FREE_CREDITS[band] },
      premium: PREMIUM_ITEM[n] ?? { credits: PREMIUM_CREDITS[band] },
    });
  }
  _levels = out;
  return out;
}

export function passLevelDef(level: number): PassLevelDef | undefined {
  return passLevels().find((l) => l.level === level);
}

// recompensas visíveis num nível: free sempre; premium só se desbloqueado.
export function passRewardsFor(level: number, premium: boolean): PassReward[] {
  const def = passLevelDef(level);
  if (!def) return [];
  return premium ? [def.free, def.premium] : [def.free];
}

// níveis atingidos e AINDA não resgatados numa trilha (premium exige unlock).
export function claimableLevels(pass: PassState | null | undefined, track: PassTrack): number[] {
  if (!pass) return [];
  if (track === 'premium' && !pass.premium) return [];
  const reached = levelForXp(pass.xp);
  const claimed = track === 'premium' ? pass.claimedPremium : pass.claimedFree;
  const out: number[] = [];
  for (let n = 1; n <= reached; n++) if (!claimed.includes(n)) out.push(n);
  return out;
}

// marca um nível como resgatado (idempotente). Validação de atingido/duplicado
// fica na store (que também paga a recompensa).
export function markPassClaimed(pass: PassState, level: number, track: PassTrack): PassState {
  if (track === 'premium') {
    if (pass.claimedPremium.includes(level)) return pass;
    return { ...pass, claimedPremium: [...pass.claimedPremium, level] };
  }
  if (pass.claimedFree.includes(level)) return pass;
  return { ...pass, claimedFree: [...pass.claimedFree, level] };
}

// slug do título exclusivo do passe premium da temporada N. Dinâmico — NÃO
// está em TITLES (titles.ts); a UI da fase B precisa de fallback de rótulo
// (ver passTitleLabel). mergeTitles aceita qualquer slug, então o grant é
// barato sem mexer na avaliação por TitleFacts.
export function passTitleSlug(seasonId: number): string {
  return `passe-s${seasonId}`;
}

// rótulo de exibição pro título dinâmico (fase B usa como fallback do titleBySlug).
export function passTitleLabel(slug: string): string | null {
  const m = /^passe-s(\d+)$/.exec(slug);
  return m ? `Passe da Temporada ${m[1]}` : null;
}
