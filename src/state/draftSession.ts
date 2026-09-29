// [realismo FM · frente B] Sessão do modo Draft (campanha do Major em andamento,
// chave `major-session-v3`): versão + migração dos atributos.
//
// v1 (legado, sem `_v`) → v2: o SEU time (os jogadores draftados e o banco)
// passa a guardar `attrs` — a fonte da verdade dos atributos, estável mesmo que
// a derivação mude num deploy futuro. Os times da IA não guardam (a sessão tem
// resgate de cota): `attrsOf` resolve pela base registrada/derivação.
// Idempotente: só preenche o que falta; roda em toda leitura.
import { attrsOf, type AttrsSource } from '../engine/attrs/model';
import type { DraftState, TPlayer, TTeam, Tournament } from '../types';

export const DRAFT_SESSION_VERSION = 2;

export interface DraftSession<P = unknown, C = unknown> {
  _v?: number;
  draft: DraftState | null;
  tournament: Tournament | null;
  pickem?: P;
  career?: C;
}

function stampPlayer(p: TPlayer): TPlayer {
  if (!p || typeof p !== 'object' || (p.attrs && p.attrs.v === 1) || typeof p.aim !== 'number') return p;
  return { ...p, attrs: attrsOf(p as unknown as AttrsSource) };
}

function stampTeam(t: TTeam): TTeam {
  if (!t || !t.isUser) return t;
  return {
    ...t,
    players: Array.isArray(t.players) ? t.players.map(stampPlayer) : t.players,
    ...(Array.isArray(t.bench) ? { bench: t.bench.map(stampPlayer) } : {}),
  };
}

export function migrateDraftSession<P, C>(raw: DraftSession<P, C>): DraftSession<P, C> {
  const tour = raw.tournament;
  const tournament = tour && Array.isArray(tour.teams) ? { ...tour, teams: tour.teams.map(stampTeam) } : tour;
  return { ...raw, tournament, _v: DRAFT_SESSION_VERSION };
}
