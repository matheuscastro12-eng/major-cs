// Mercado VIVO da IA (Brasval gap #23) — tickAIMarketActivity.
//
// Roda no fechamento de cada evento/split (o mesmo ponto onde CareerScreen já
// chama consummateDeals/evolveSquad) e faz o mundo se mexer sozinho: cada clube
// de IA, GATED pela forma REAL de clube (engine/career/teamForm — gap #7),
// tenta UM movimento — contratar um upgrade do mercado livre (__free__) ou
// tirar um jogador de um rival em má fase.
//
// Regras de vida do ecossistema:
//   - form >= TEAM_FORM_PASSIVE (55): clube passivo — campeão fica quieto.
//   - form < TEAM_FORM_PASSIVE: pode agir (stagger por hash de id+split — só
//     ~1/4 dos elegíveis age num tick).
//   - form < TEAM_FORM_CRISIS (40): hiperativo (~metade age; único que rouba
//     de rival quando o mercado livre não tem upgrade).
//   - volume BAIXO e orgânico: no máximo AI_MARKET_MAX_MOVES por tick, times
//     em pior forma têm prioridade na fila.
//
// Persistência: os movimentos saem como patch de save.moves (playerId → teamId),
// a MESMA rota das vendas do usuário (applyMoves/consummateDeals). O pool de
// jogadores é conservado: quem perde a vaga numa contratação do mercado livre
// é liberado pro __free__; num roubo de rival os dois trocam de clube (swap),
// então nenhum elenco fica com menos de 5.
//
// Puro e determinístico: nada de Math.random/Date.now — só hashStr sobre
// (teamId, split). Mesmo save + mesmo split ⇒ mesmos movimentos.

import type { Player, Role, TeamSeason } from '../../types';
import { playerOvr, playerValue } from '../ratings';
import { hashStr } from '../../state/hash';
import { ct } from '../../state/career-i18n';
import { computeAllTeamForms, TEAM_FORM_CRISIS, TEAM_FORM_PASSIVE, type TeamFormSave } from './teamForm';

// id do "time" virtual que guarda os free agents em CS2_REAL_2026
export const FREE_TEAM_ID = '__free__';

// teto de movimentos por tick (~95 clubes ⇒ um punhado de manchetes por janela)
export const AI_MARKET_MAX_MOVES = 5;

// chance (0-100) de um clube elegível agir neste tick — o stagger por hash
const ACT_CHANCE_CRISIS = 50; // form < TEAM_FORM_CRISIS: hiperativo
const ACT_CHANCE_SOFT = 25;   // TEAM_FORM_CRISIS <= form < TEAM_FORM_PASSIVE

export interface AIMarketMove {
  kind: 'free' | 'poach';
  playerId: string;
  nick: string;
  country: string;
  role: Role;
  ovr: number;
  fee: number; // 0 no mercado livre; valor de tabela no roubo de rival
  fromId: string;
  fromTag: string;
  fromName: string;
  toId: string;
  toTag: string;
  toName: string;
  outPlayerId: string; // deslocado: → __free__ (free) ou → fromId (poach/swap)
  outNick: string;
  reason?: string; // sabor PT-BR pro feed do mercado
}

// estruturalmente compatível com o NewsItem do CareerScreen (cat 'transfer')
export interface AIMarketNewsItem {
  id: string;
  split: number;
  icon: string;
  tone: 'info';
  cat: 'transfer';
  title: string;
  body: string;
}

export interface AIMarketTickArgs {
  save: TeamFormSave;   // forma REAL de clube sai daqui (cacheada por save)
  split: number;        // seed do tick (split que está fechando)
  teams: TeamSeason[];  // clubes de IA (currentEra sem o clube do usuário)
  freeAgents: Player[]; // pool ATUAL do __free__ (já com save.moves aplicado)
  // jogadores do elenco do USUÁRIO — intocáveis (a IA nunca assina/desloca;
  // roubo do user continua passando SÓ pelas propostas com consentimento)
  protectedIds?: ReadonlySet<string>;
  // ids que existem em CS2_REAL_2026 — só esses são endereçáveis por
  // save.moves (backfill sintético/extraOnTeam ficam fora do mercado da IA)
  movableIds: ReadonlySet<string>;
  maxMoves?: number;
}

export interface AIMarketTick {
  moves: Record<string, string>; // patch pra mesclar em save.moves
  log: AIMarketMove[];
  news: AIMarketNewsItem[];
}

const ROLE_LABEL: Record<Role, string> = {
  AWP: 'AWPer', IGL: 'IGL', Rifler: 'rifler', Entry: 'entry', Support: 'suporte', Lurker: 'lurker',
};

const roleMatches = (p: Player, role: Role): boolean => p.role === role || p.role2 === role;

// desempate estável (determinismo não pode depender da ordem do array de entrada)
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function newsFor(m: AIMarketMove, split: number): AIMarketNewsItem {
  const roleLabel = ROLE_LABEL[m.role] ?? m.role;
  const crisis = m.reason === ct('reformulação após crise de resultados');
  const opener = crisis ? `${ct('Em crise, a')} ${m.toName}` : `${ct('A')} ${m.toName}`;
  const title = m.kind === 'free'
    ? `${m.toName} ${ct('contrata')} ${m.nick} ${ct('do mercado livre')}`
    : `${m.toName} ${ct('tira')} ${m.nick} ${ct('da')} ${m.fromName}`;
  const body = m.kind === 'free'
    ? `${opener} ${ct('foi ao mercado livre e fechou com o')} ${roleLabel} ${m.nick} (OVR ${m.ovr}). ${m.outNick} ${ct('perde a vaga e fica livre no mercado.')}`
    : `${opener} ${ct('buscou o')} ${roleLabel} ${m.nick} (OVR ${m.ovr}) ${ct('na')} ${m.fromName}; ${m.outNick} ${ct('faz o caminho inverso na troca.')}`;
  return { id: `${split}:aimkt:${m.playerId}`, split, icon: m.kind === 'free' ? '🖊️' : '🔁', tone: 'info', cat: 'transfer', title, body };
}

export function tickAIMarketActivity(args: AIMarketTickArgs): AIMarketTick {
  const { save, split, teams, freeAgents, movableIds } = args;
  const protectedIds = args.protectedIds ?? new Set<string>();
  const maxMoves = args.maxMoves ?? AI_MARKET_MAX_MOVES;
  const forms = computeAllTeamForms(save);
  const formOfTeam = (id: string) => forms[id] ?? 50;

  // QUEM AGE: gate por forma + stagger por hash(id, split). Clube em alta não
  // se mexe; abaixo do passivo entra no sorteio determinístico do tick.
  const actors = teams
    .filter((t) => t.id !== FREE_TEAM_ID && t.players.length >= 5)
    .filter((t) => {
      const form = formOfTeam(t.id);
      if (form >= TEAM_FORM_PASSIVE) return false; // passivo: campeão quieto
      const chance = form < TEAM_FORM_CRISIS ? ACT_CHANCE_CRISIS : ACT_CHANCE_SOFT;
      return hashStr(`aimkt:${split}:${t.id}`) % 100 < chance;
    })
    // pior forma age primeiro (prioridade sob o teto de movimentos por tick)
    .sort((a, b) => (formOfTeam(a.id) - formOfTeam(b.id)) || byId(a, b));

  const moves: Record<string, string> = {};
  const log: AIMarketMove[] = [];
  const news: AIMarketNewsItem[] = [];
  const usedPlayers = new Set<string>();  // ninguém se move 2x no mesmo tick
  const touchedTeams = new Set<string>(); // um clube participa de 1 negócio/tick
  // elegível pra entrar/sair via moves neste tick
  const eligible = (p: Player) => movableIds.has(p.id) && !protectedIds.has(p.id) && !usedPlayers.has(p.id);

  for (const team of actors) {
    if (log.length >= maxMoves) break;
    if (touchedTeams.has(team.id)) continue;
    const form = formOfTeam(team.id);

    // alvo da vaga: o elo mais fraco do elenco (que dá pra mover via moves)
    const weakest = team.players.filter(eligible).sort((a, b) => (playerOvr(a) - playerOvr(b)) || byId(a, b))[0];
    if (!weakest) continue;
    const weakOvr = playerOvr(weakest);
    if (weakOvr >= 84) continue; // elenco de elite: não há upgrade plausível

    // upgrade tem que ser real (+2) mas plausível (sem astro em time fraco)
    const plausible = (p: Player): boolean => {
      const ovr = playerOvr(p);
      if (ovr < weakOvr + 2 || ovr > weakOvr + 12) return false;
      if (ovr > team.teamwork + 12) return false; // fora do tier do clube
      if (ovr >= 88 && team.teamwork < 80) return false; // estrela só na elite
      return roleMatches(p, weakest.role);
    };

    // 1) MERCADO LIVRE: melhor upgrade disponível no __free__
    const fa = freeAgents.filter((p) => eligible(p) && plausible(p))
      .sort((a, b) => (playerOvr(b) - playerOvr(a)) || byId(a, b))[0];

    let move: AIMarketMove | null = null;
    if (fa) {
      move = {
        kind: 'free', playerId: fa.id, nick: fa.nick, country: fa.country, role: weakest.role,
        ovr: playerOvr(fa), fee: 0,
        fromId: FREE_TEAM_ID, fromTag: 'FA', fromName: ct('mercado livre'),
        toId: team.id, toTag: team.tag, toName: team.team,
        outPlayerId: weakest.id, outNick: weakest.nick,
        reason: form < TEAM_FORM_CRISIS ? ct('reformulação após crise de resultados') : ct('reforço após campanha fraca'),
      };
      moves[fa.id] = team.id;
      moves[weakest.id] = FREE_TEAM_ID; // deslocado é liberado — pool conservado
    } else if (form < TEAM_FORM_CRISIS) {
      // 2) ROUBO DE RIVAL (só clube em crise): procura em rivais também fora de
      // forma (quem está em alta não libera ninguém). Swap: o deslocado do
      // comprador vai pro rival, ambos seguem com 5.
      const sources = teams
        .filter((o) => o.id !== team.id && o.id !== FREE_TEAM_ID && !touchedTeams.has(o.id)
          && o.players.length >= 5 && formOfTeam(o.id) < TEAM_FORM_PASSIVE)
        .sort((a, b) => (formOfTeam(a.id) - formOfTeam(b.id)) || byId(a, b));
      for (const src of sources) {
        const target = src.players
          .filter((p) => eligible(p) && plausible(p) && playerOvr(p) < 88) // astro não sai em roubo
          .sort((a, b) => (playerOvr(b) - playerOvr(a)) || byId(a, b))[0];
        if (!target) continue;
        move = {
          kind: 'poach', playerId: target.id, nick: target.nick, country: target.country, role: weakest.role,
          ovr: playerOvr(target), fee: playerValue(target),
          fromId: src.id, fromTag: src.tag, fromName: src.team,
          toId: team.id, toTag: team.tag, toName: team.team,
          outPlayerId: weakest.id, outNick: weakest.nick,
          reason: ct('reformulação após crise de resultados'),
        };
        moves[target.id] = team.id;
        moves[weakest.id] = src.id; // swap: rival não fica com menos de 5
        touchedTeams.add(src.id);
        break;
      }
    }
    if (!move) continue;
    usedPlayers.add(move.playerId);
    usedPlayers.add(move.outPlayerId);
    touchedTeams.add(team.id);
    log.push(move);
    news.push(newsFor(move, split));
  }

  return { moves, log, news };
}
