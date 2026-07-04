// decideOffer multifatorial (Brasval gap #14) — a IA do CLUBE VENDEDOR.
//
// Substitui o clubReply puramente proporcional do CareerScreen por uma decisão
// que pondera o CONTEXTO do vendedor, mantendo o contrato NegoReply (o
// NegotiationModal continua funcionando — só ganhou um `reason` opcional).
//
// ── Fórmula (fatores COMPÕEM num piso ajustado, sem pilha de casos especiais) ──
//
//   A `asking` que chega já embute a resistência base por OVR/teamwork
//   (sellResistance do CareerScreen) — então os fatores NOVOS entram como
//   multiplicadores RELATIVOS sobre ela:
//
//     adj  = importanceF × replacementF × prestigeF × formF   (clamp 0.80–1.45)
//     alvo = asking × adj                                     (alvo da rodada 0)
//     alvo = max(alvo, 1.7 × valor)  se o jogador é o FRANCHISE-CORE (melhor
//                                    OVR do elenco) — só sai por ágio enorme
//     piso(rodada) = alvo × (1 − 0.04 × min(rodada, 3))       (amolece ≤12%)
//     piso, alvo e contraproposta são LIMITADOS por max(asking, 2 × valor)
//
//   oferta ≥ piso            → accept (com reason se um fator dominou)
//   oferta/piso < 0.45       → reject imediato (proposta ofensiva)
//   oferta/piso < 0.60 e 3ª+ → reject FIRM (clube cansou do lowball)
//   senão                    → counter = clamp(max(piso, (oferta+alvo)/2))
//
//   Monotonicidade preservada do código antigo: pro MESMO valor de oferta a
//   contraproposta nunca SOBE entre rodadas (alvo fixo, piso só amolece) e
//   nunca cai abaixo do piso da rodada — insistir não derruba o preço além
//   do amolecimento previsto.
//
// ── Fatores ──
//   importanceF   · rank do jogador no elenco (sortByOvr): 2º melhor ×1.05,
//                   pior do elenco ×0.95. O MELHOR vira franchise-core (piso
//                   absoluto de 1.7× o valor de mercado, com razão textual).
//   replacementF  · sem outro jogador da mesma função no elenco E sem free
//                   agent plausível (mesma role, OVR ≥ alvo−6) → ×1.15.
//   prestigeF     · gap de força entre comprador (org do usuário) e vendedor
//                   (média top-5 de OVR): vender "pra baixo" exige ágio
//                   (até ×1.12), vender pra org maior facilita (até ×0.92).
//   formF         · forma REAL do clube (engine/career/teamForm): em alta
//                   (≥TEAM_FORM_PASSIVE) resiste até ×1.12; em crise
//                   (<TEAM_FORM_CRISIS) libera até ×0.85 ("precisa de caixa").
//
// ── Fatores do Brasval PULADOS (não modelados neste codebase) ──
//   moral         · save.morale só existe pro elenco do USUÁRIO (é deletado na
//                   venda e nunca é escrito pra jogador de clube de IA).
//   salário       · a IA não tem folha/finanças modeladas (ver teamForm.ts) —
//                   não há "atratividade salarial" pra pesar num deal de IA.
//
// Puro e determinístico: nada de Math.random/Date.now — o único ruído (estrela
// "não está à venda") é hashStr sobre o id do jogador, como no código antigo.

import type { Player, Role } from '../../types';
import { playerOvr } from '../ratings';
import { hashStr } from '../../state/hash';
import { ct } from '../../state/career-i18n';
import { TEAM_FORM_CRISIS, TEAM_FORM_PASSIVE } from './teamForm';

// contrato do NegotiationModal — campos/semântica antigos INTACTOS; `reason`
// é opcional e só adiciona o "porquê" textual da resposta.
export type NegoReply =
  | { kind: 'accept'; reason?: string }
  | { kind: 'counter'; value: number; reason?: string }
  | { kind: 'reject'; firm: boolean; msg: string };

// contexto OPCIONAL do vendedor — tudo degradável: sem contexto, decideOffer
// se comporta como o clubReply antigo (adj = 1).
export interface DecideOfferCtx {
  sellerRoster?: Player[];  // elenco ATUAL do vendedor (pós save.moves)
  sellerForm?: number;      // formOf(save, from.id) — 0-100, neutro 50
  buyerStrength?: number;   // força do comprador (média top-5 de OVR do user)
  freeAgents?: Player[];    // pool __free__ atual (reposição realista de role)
}

export interface DecideOfferArgs {
  offer: number;        // oferta TOTAL (dinheiro + valor da troca)
  asking: number;       // pedida exibida (playerValue × sellResistance)
  marketValue: number;  // playerValue puro do alvo
  player: Player;
  fromTeamwork: number; // teamwork do clube vendedor
  round: number;        // rodada da negociação (0-based)
  ctx?: DecideOfferCtx;
}

// ágio mínimo pra tirar o coração do time (franchise-core): 1.7× o valor
export const FRANCHISE_CORE_RATIO = 1.7;
// teto de sanidade da contraproposta/piso: nunca acima de 2× o valor de
// mercado (a não ser que a própria pedida-base já seja maior — estrela de top)
export const COUNTER_CAP_RATIO = 2.0;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const roleMatches = (p: Player, role: Role): boolean => p.role === role || p.role2 === role;
// desempate estável por id (mesma convenção do transferAI — determinismo não
// pode depender da ordem do array de entrada)
const byOvrDesc = (a: Player, b: Player) =>
  playerOvr(b) - playerOvr(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// rank do jogador no elenco do vendedor ordenado por OVR (0 = melhor).
// null quando o elenco não veio no contexto ou o jogador não está nele.
function rosterRank(player: Player, roster: Player[] | undefined): { rank: number; size: number } | null {
  if (!roster || roster.length < 2) return null;
  const sorted = [...roster].sort(byOvrDesc);
  const rank = sorted.findIndex((p) => p.id === player.id);
  return rank < 0 ? null : { rank, size: sorted.length };
}

// o vendedor tem reposição pra função? Outro jogador da mesma role no elenco
// OU um free agent plausível (mesma role, no máximo 6 de OVR abaixo do alvo).
function hasRoleReplacement(player: Player, ctx: DecideOfferCtx): boolean | null {
  const roster = ctx.sellerRoster;
  if (!roster || roster.length < 2) return null; // sem contexto → fator neutro
  const inHouse = roster.some((p) => p.id !== player.id && roleMatches(p, player.role));
  if (inHouse) return true;
  const floor = playerOvr(player) - 6;
  return (ctx.freeAgents ?? []).some((p) => roleMatches(p, player.role) && playerOvr(p) >= floor);
}

// média top-5 de OVR — proxy de força/prestígio de um elenco
export function squadStrength(roster: Player[]): number {
  if (roster.length === 0) return 0;
  const top = [...roster].sort(byOvrDesc).slice(0, 5);
  return top.reduce((a, p) => a + playerOvr(p), 0) / top.length;
}

export function decideOffer(args: DecideOfferArgs): NegoReply {
  const { offer, asking, marketValue, player, fromTeamwork, round } = args;
  const ctx = args.ctx ?? {};
  const ovr = playerOvr(player);

  // estrela de time forte às vezes simplesmente não está à venda (regra
  // preservada do clubReply antigo — mesmo hash, saves se comportam igual)
  if (ovr >= 89 && fromTeamwork >= 84 && round === 0 && hashStr(`${player.id}:nfs`) % 100 < 55) {
    return { kind: 'reject', firm: true, msg: `${player.nick} ${ct('não está à venda. O clube não quer nem ouvir.')}` };
  }

  // ── fatores (cada um com a razão textual candidata) ──
  let reason: string | undefined;

  // 1) importância no elenco (rank por OVR) + proteção franchise-core
  const rankInfo = rosterRank(player, ctx.sellerRoster);
  const isCore = rankInfo != null && rankInfo.rank === 0 && rankInfo.size >= 3;
  let importanceF = 1.0;
  if (rankInfo && !isCore) {
    if (rankInfo.rank === 1) importanceF = 1.05;                 // vice-estrela
    else if (rankInfo.rank === rankInfo.size - 1) importanceF = 0.95; // pior do elenco
  }

  // 2) reposição na função
  const replacement = hasRoleReplacement(player, ctx);
  const replacementF = replacement === false ? 1.15 : 1.0;

  // 3) gap de prestígio comprador × vendedor (só com os dois lados conhecidos)
  let prestigeF = 1.0;
  if (ctx.buyerStrength != null && ctx.sellerRoster && ctx.sellerRoster.length > 0) {
    const diff = ctx.buyerStrength - squadStrength(ctx.sellerRoster);
    prestigeF = clamp(1 - diff * 0.004, 0.92, 1.12); // vender pra baixo = ágio
  }

  // 4) forma do clube (teamForm — gap #7)
  const form = ctx.sellerForm;
  let formF = 1.0;
  if (form != null) {
    // alta: até +12% (rampa suave até form 100) · crise: até −15% (rampa
    // CURTA — em form 20 o desconto já é cheio: "precisa de caixa" tem que
    // ser sentido no preço, não ser cosmético)
    if (form >= TEAM_FORM_PASSIVE) formF = 1 + (Math.min(form - TEAM_FORM_PASSIVE, 45) / 45) * 0.12;
    else if (form < TEAM_FORM_CRISIS) formF = 1 - (Math.min(TEAM_FORM_CRISIS - form, 20) / 20) * 0.15;
  }

  // razão dominante (prioridade: core > sem reposição > crise > alta > prestígio)
  if (isCore) reason = ct('É o coração do time — só sai por proposta irrecusável.');
  else if (replacement === false) reason = ct('Sem reposição pra função no elenco — o clube pede ágio.');
  else if (formF < 1) reason = ct('Time em crise precisa de caixa — disposto a facilitar.');
  else if (formF > 1) reason = ct('Time em grande fase não quer mexer no elenco.');
  else if (prestigeF > 1.02) reason = ct('Vender pra uma org menor custa mais caro.');
  else if (prestigeF < 0.98) reason = ct('A vitrine de uma org maior facilita a conversa.');

  // ── composição: piso ajustado + amolecimento por rodada + teto de sanidade ──
  const adj = clamp(importanceF * replacementF * prestigeF * formF, 0.8, 1.45);
  const cap = Math.max(asking, Math.round(marketValue * COUNTER_CAP_RATIO));
  // alvo da rodada 0 (fixo entre rodadas — garante contraproposta monotônica)
  let target = Math.round(asking * adj);
  if (isCore) target = Math.max(target, Math.round(marketValue * FRANCHISE_CORE_RATIO));
  target = Math.min(target, cap);
  // PISO: amolece no MÁXIMO ~12% em poucas rodadas e NUNCA abaixo disso —
  // insistir com a mesma oferta não derruba mais o preço (regra preservada)
  const floor = Math.round(target * (1 - 0.04 * Math.min(round, 3)));

  if (offer >= floor) return { kind: 'accept', reason };

  const ratio = offer / Math.max(1, floor);
  // lowball repetido: o clube cansa e encerra a negociação
  if (ratio < 0.6 && round >= 2) {
    return { kind: 'reject', firm: true, msg: ct('O clube cansou da conversa: proposta baixa demais, negociação encerrada.') };
  }
  if (ratio < 0.45) {
    const msg = isCore
      ? `${ct('É o coração do time — só sai por proposta irrecusável.')} ${ct('O clube recusou na hora.')}`
      : ct('Proposta muito abaixo do valor. O clube recusou na hora.');
    return { kind: 'reject', firm: false, msg };
  }
  // contraproposta entre a oferta e o alvo, SEMPRE ≥ piso e ≤ teto de sanidade
  const counter = clamp(Math.max(floor, Math.round((offer + target) / 2)), floor, cap);
  return { kind: 'counter', value: counter, reason };
}
