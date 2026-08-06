// SÉRIE DO DIA — o desafio diário competitivo do Road to Pro. Puro, sem React.
//
// A ideia: TODO MUNDO joga exatamente a MESMA série no mesmo dia — mesmo herói
// (o "Pro do Dia", um fixture determinístico), mesmo adversário, mesmo seed de
// beats/rolls na Sala. A única variável é a SUA jogada (decisões + execuções nos
// minigames) → o rating final é comparável e vai pro ranking diário.
//
// Isso só é possível porque a Sala (engine/rtp/room.ts) é pura e determinística
// pelo seed — a refatoração de julho/2026 pagou exatamente este dividendo.
//
// Reuso máximo: o fixture nasce do createRtpSave (seed do dia), a partida vem do
// prepareCircuitMatch (primeira série do calendário do fixture) e o resultado do
// finishCircuitMatch — zero código novo de partida.

import { hashStr } from '../../state/hash';
import { dateKeyOf, dayNumberOf } from '../daily/lines';
import { createRtpSave } from './createSave';
import { prepareCircuitMatch, finishCircuitMatch } from './circuit';
import type { MatchPrep, ProMatchResult } from './matchSim';
import type { MomentOutcome } from './moments';
import type { RoadToProSave, ArchetypeKind } from './types';
import type { MapId, Role } from '../../types';
import type { PlayerPersonality } from '../career/personality';

export { dateKeyOf, dayNumberOf };

// rotação do protagonista: cada dia um estilo diferente de jogar.
const ROLES: Role[] = ['Rifler', 'AWP', 'Entry', 'IGL', 'Lurker', 'Support'];
const ARCHETYPES: ArchetypeKind[] = ['aimstar', 'tactician', 'clutchgod', 'allrounder'];
const PERSONAS: PlayerPersonality[] = ['leader', 'prodigy', 'resilient', 'hothead', 'mercenary'];

// nomes de guerra do Pro do Dia (sabor — o ranking mostra o SEU nick).
const DAY_NICKS = ['fantasma', 'zerinho', 'prodigio', 'veterano', 'colossus', 'aurora', 'brasa'];

export interface DailyChallenge {
  dateKey: string;
  day: number;                 // nº do desafio (mesma época do Diário)
  role: Role;
  heroNick: string;
  save: RoadToProSave;         // fixture — IGUAL pra todo mundo no dia
  prep: MatchPrep;             // a série do dia (adversário/mapas/seed fixos)
}

// Fixture do dia: determinístico pela DATA — mesma régua pro planeta inteiro.
export function dailyChallengeOf(dateKey: string): DailyChallenge {
  const day = dayNumberOf(dateKey);
  const seed = (hashStr(`serie-do-dia:${dateKey}`) ^ 0x5e21e) >>> 0;
  const role = ROLES[day % ROLES.length];
  const save = createRtpSave({
    nick: DAY_NICKS[day % DAY_NICKS.length],
    country: 'br',
    role,
    personality: PERSONAS[seed % PERSONAS.length],
    archetype: ARCHETYPES[(seed >>> 3) % ARCHETYPES.length],
    age: 19,
    categoryPoints: { mechanical: 4, mental: 4, physical: 4 },
    seed,
    // challenger: adversários de nível real, sem ser o teto (sobra margem pro
    // rating de quem joga MUITO bem aparecer).
    startTier: 'challenger',
  });
  const prep = prepareCircuitMatch(save);
  if (!prep) throw new Error('fixture do dia sem partida — createRtpSave sem liga');
  return { dateKey, day, role, heroNick: save.player.nick, save, prep };
}

// Resolve o resultado oficial da série jogada (mesma régua do modo carreira).
export function finishDailySeries(
  ch: DailyChallenge, outcomes: MomentOutcome[], liveMaps?: { map: MapId; score: [number, number]; won: boolean }[],
): ProMatchResult {
  return finishCircuitMatch(ch.save, ch.prep, outcomes, liveMaps).result;
}

// Placar do ranking: rating manda; vitória desempata; varrida desempata de novo.
export interface DailyScore {
  rating: number;              // heroRating (2 casas) — o número do dia
  won: boolean;
  mapScore: [number, number];
}
export function dailyScoreOf(result: ProMatchResult): DailyScore {
  return { rating: result.heroRating, won: result.won, mapScore: result.mapScore };
}

// texto de share (o print é o convite — mesmo padrão do Diário).
export function dailyShareText(day: number, s: DailyScore, rank: number | null, streakDays = 0): string {
  const res = s.won ? `venci ${s.mapScore[0]}–${s.mapScore[1]}` : `caí ${s.mapScore[0]}–${s.mapScore[1]}`;
  const pos = rank ? ` · top #${rank}` : '';
  const streak = streakDays >= 2 ? ` · 🔥 ${streakDays} dias` : '';
  return `SÉRIE DO DIA #${day} · MAJOR//CS\nRating ${s.rating.toFixed(2)} — ${res}${pos}${streak}\nMesma série pra todo mundo. Consegue mais?\nroadtomajor.com.br`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DESAFIO DE FANTASMA — o link que fecha o loop viral: você joga, manda o link,
// o amigo joga a MESMA série (o fixture já é o mesmo — dividendo da Sala pura)
// e o jogo compara os ratings. Quem abre sem vitalícia cai no funil.

export interface GhostChallenge {
  day: number;
  nick: string;
  rating: number;   // 2 casas, faixa real do motor (0..2.5)
}

// nick seguro pro param/render: só [a-z0-9_], até 20 chars (o link não é canal
// de injeção nem de palavrão gigante).
function safeNick(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'anon';
}

// param compacto `day-rating100-nick` (ex.: "12-131-fallen") — sobrevive a
// WhatsApp/Telegram sem escaping.
export function ghostParamOf(g: GhostChallenge): string {
  return `${g.day}-${Math.round(g.rating * 100)}-${safeNick(g.nick)}`;
}

export function ghostLinkOf(g: GhostChallenge): string {
  return `https://roadtomajor.com.br/?desafio=${ghostParamOf(g)}`;
}

export function parseGhostParam(raw: string | null | undefined): GhostChallenge | null {
  if (!raw) return null;
  const m = /^(\d{1,5})-(\d{1,3})-([a-z0-9_]{1,20})$/.exec(raw.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const rating = Number(m[2]) / 100;
  if (day < 1 || !(rating >= 0 && rating <= 2.5)) return null;
  return { day, nick: m[3], rating };
}

// convite que vai junto do link (o texto é o desafio; o link é a armadilha).
export function ghostInviteText(g: GhostChallenge): string {
  return `🥊 Te desafio na SÉRIE DO DIA #${g.day} do MAJOR//CS.\nFiz ${g.rating.toFixed(2)} de rating na MESMA série que você vai jogar. Me supera:\n${ghostLinkOf(g)}`;
}
