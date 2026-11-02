// [equilíbrio] Régua única de força, entrosamento por convivência, vantagem da IA
// por modo e técnico que pesa. Roda via `npm run test:sim`.
//
// O ESPELHO: o mesmo elenco como seu time (takeover intacto) × como time da IA,
// MD3, 8 elencos do topo ao meio do mundo. Antes desta frente a Carreira dava
// 62,7% ao usuário (sinergia·0,7 − malus só do seu lado + entrosamento 90 no
// dia 1), e o modo de dificuldade não mexia na partida.
//
// Cobertura:
//   - espelho sem vantagem e sem plano: 50 ±3%
//   - espelho por modo (estilo padrão, sem plano): Normal 55, Difícil 45, Lendário 37 (±3)
//   - o plano virou atalho de estilo (sem bônus de força): Agressivo ≤ Disciplinado + 3 pp
//   - takeover intacto = a mesma força da IA (±0,01)
//   - org nova: entrosamento ≤ 74 no split 1; cresce +2/split até +12
//   - takeover: −3 por titular novo, +2/split de volta
//   - técnico nota 18 × nota 10: ≥ +6 pp; nota 5: abaixo da nota 10; comissão padrão = 0
//   - dream team no Lendário: ≤ 25% de títulos em 10 splits de circuito
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import type { Coach, Player, TeamSeason, TTeam } from '../src/types.ts';
import { buildUserTeam, draftSynergy, playerOvr, teamSeasonToTTeam, coachBaseBonus } from '../src/engine/ratings.ts';
import { buildAiWorld } from '../src/engine/career/aiWorld.ts';
import { makeRng } from '../src/engine/rng.ts';
import {
  MODE_AI_EDGE, NEW_ORG_TW_CAP, careerUserTeam, newOrgTeamwork, takeoverTeamwork, togetherSplits, coachForMatch, stylePower, coachMatchImpact,
} from '../src/engine/career/equilibrio.ts';
import { headCoachFromCoach } from '../src/engine/gestao/staff.ts';
import { aiFor, mirror, prepUser, ranked, series, takeoverUser, MIRROR_RANKS } from './lib/equilibrio-harness.mts';
import { decideOffer, MARKET_BY_MODE } from '../src/engine/career/decideOffer.ts';
import { demandFor, willingToNegotiate, type NegoProfile } from '../src/engine/clube/contratos.ts';
import { tickMarketWindow, AI_MARKET_BY_MODE } from '../src/engine/clube/mercadoIA.ts';
import { agedFreeAgents, aiAgeOf, baseOvrOf, BASE_PLAYER_IDS } from '../src/engine/career/aiWorld.ts';
import { playerValue } from '../src/engine/ratings.ts';

const N = Number(process.env.EQ_N ?? 250);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

test('espelho sem vantagem e sem plano: o motor é neutro (50 ±3%)', () => {
  const w = mirror(null, 'none', N);
  assert.ok(Math.abs(w - 0.5) <= 0.03, `espelho neutro deu ${pct(w)}`);
});

test('espelho por modo (estilo padrão, sem plano): Normal ~55%, Difícil ~45%, Lendário ~37% (±3)', () => {
  const target = { normal: 0.55, hard: 0.45, legend: 0.37 } as const;
  for (const mode of ['normal', 'hard', 'legend'] as const) {
    const w = mirror(mode, 'none', N);
    assert.ok(Math.abs(w - target[mode]) <= 0.03, `${mode} (IA +${MODE_AI_EDGE[mode]}): ${pct(w)}, alvo ${pct(target[mode])}`);
  }
});

test('plano é atalho de estilo, sem bônus de força: Agressivo não passa o Disciplinado em mais de 3 pp', () => {
  const d = mirror('normal', 'disciplined', N);
  const a = mirror('normal', 'aggressive', N);
  assert.ok(a - d <= 0.03, `Agressivo ${pct(a)} × Disciplinado ${pct(d)}`);
});

test('takeover intacto tem exatamente a força da IA (±0,01)', () => {
  for (const i of MIRROR_RANKS) {
    const org = ranked[i];
    const u = takeoverUser(org);
    const ai = teamSeasonToTTeam(org);
    assert.ok(Math.abs(u.strength - ai.strength) <= 0.01, `${org.team}: usuário ${u.strength.toFixed(3)} × IA ${ai.strength.toFixed(3)}`);
    assert.equal(u.teamwork, org.teamwork);
  }
});

// melhor jogador do mundo por função (o "dream team" de quem monta elenco)
const ROLES = ['AWP', 'IGL', 'Entry', 'Support', 'Rifler'] as const;
function dreamPicks(world: TeamSeason[]): { player: Player; from: TeamSeason }[] {
  const all = world.flatMap((t) => t.players.map((p) => ({ player: p, from: t })));
  const out: { player: Player; from: TeamSeason }[] = [];
  for (const r of ROLES) {
    const best = all.filter((x) => x.player.role === r && !out.some((o) => o.player.id === x.player.id))
      .sort((a, b) => playerOvr(b.player) - playerOvr(a.player))[0];
    if (best) out.push(best);
  }
  return out;
}

test('org nova: entrosamento ≤ 74 no split 1, +2 por split juntos até +12', () => {
  const picks = dreamPicks(ranked);
  const built = buildUserTeam('Dream', picks, ranked[0].coach);
  const syn = draftSynergy(built.players).total;
  const tw1 = newOrgTeamwork(syn, togetherSplits([0, 0, 0, 0, 0]));
  assert.ok(tw1 <= NEW_ORG_TW_CAP, `split 1: ${tw1}`);
  assert.equal(newOrgTeamwork(syn, togetherSplits([1, 1, 1, 1, 1])), tw1 + 2);
  assert.equal(newOrgTeamwork(syn, togetherSplits([9, 9, 9, 9, 9])), tw1 + 12);
  // quem chegou depois define o tempo do par
  assert.equal(togetherSplits([4, 4, 4, 4, 0]), (6 * 4) / 10);
  // e a força do dream team no dia 1 não passa do melhor time da IA por sinergia
  const dream = careerUserTeam(built, tw1);
  const legacy = built.strength; // escala antiga do draft (sinergia·0,7 − malus, entrosamento 78+)
  assert.ok(dream.strength < legacy, `régua nova ${dream.strength.toFixed(1)} × antiga ${legacy.toFixed(1)}`);
});

test('takeover: −3 por titular novo, recuperando +2 por split', () => {
  assert.equal(takeoverTeamwork(70, 0, []), 70);
  assert.equal(takeoverTeamwork(70, 0, [0, 0]), 64);
  assert.equal(takeoverTeamwork(70, 0, [1]), 69);
  assert.equal(takeoverTeamwork(70, 0, [2]), 70);
});

test('técnico: nota 18 × nota 10 ≥ +6 pp na MD3; nota 5 pior que a 10; comissão padrão = 0', () => {
  const mk = (nota: number): Coach => ({ nick: `c${nota}`, name: 'C', country: 'br', rating: 45 + (nota - 3) * 3, style: 'tactical' });
  // a potência do estilo sai do atributo da função na comissão (técnico portado da base)
  const withPow = (c: Coach) => coachForMatch(c, headCoachFromCoach(c, 'k'));
  const w = (c: Coach) => mirror(null, 'none', Math.round(N * 0.8), () => withPow(c));
  const w18 = w(mk(18)), w10 = w(mk(10)), w5 = w(mk(5));
  assert.ok(w18 - w10 >= 0.06, `nota 18 ${pct(w18)} × nota 10 ${pct(w10)}`);
  assert.ok(w5 < w10, `nota 5 ${pct(w5)} × nota 10 ${pct(w10)}`);
  assert.equal(coachBaseBonus(mk(10)), 0);
  assert.equal(coachMatchImpact(mk(10)).points, 0);
  assert.equal(stylePower(10), 0);
});

// etapa de circuito: grupos GSL 4×4 (dupla eliminação MD3) → playoffs de 8 MD3
function runEvent(user: TTeam, field: TTeam[], seed: number): boolean {
  const rng = makeRng(seed >>> 0);
  const teams = [user, ...field.slice(0, 15)];
  for (let i = teams.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [teams[i], teams[j]] = [teams[j], teams[i]]; }
  let k = 0;
  const play = (a: TTeam, b: TTeam): TTeam => {
    const s = seed * 131 + (k++) * 7919;
    const A = a.isUser ? prepUser(a, b.id, 'none') : a;
    const B = b.isUser ? prepUser(b, a.id, 'none') : b;
    return series(A, B, s) ? a : b;
  };
  const q: TTeam[][] = [];
  for (let g = 0; g < 4; g++) {
    const [a, b, c, d] = teams.slice(g * 4, g * 4 + 4);
    const w1 = play(a, b), l1 = w1 === a ? b : a, w2 = play(c, d), l2 = w2 === c ? d : c;
    const first = play(w1, w2), lw = first === w1 ? w2 : w1;
    const second = play(lw, play(l1, l2));
    q.push([first, second]);
  }
  let bracket = [q[0][0], q[1][1], q[1][0], q[0][1], q[2][0], q[3][1], q[3][0], q[2][1]];
  while (bracket.length > 1) {
    const nx: TTeam[] = [];
    for (let i = 0; i < bracket.length; i += 2) nx.push(play(bracket[i], bracket[i + 1]));
    bracket = nx;
  }
  return !!bracket[0].isUser;
}

test('dream team no Lendário: ≤ 25% de títulos em 10 splits de circuito', () => {
  const picks = dreamPicks(ranked);
  const skip = new Set(picks.map((p) => p.player.id));
  const eliteCoach = [...ranked].map((t) => t.coach).sort((a, b) => b.rating - a.rating)[0];
  const coach = coachForMatch(eliteCoach, headCoachFromCoach(eliteCoach, 'k'));
  let titles = 0, events = 0;
  for (let split = 1; split <= 10; split++) {
    const world = buildAiWorld({ base: CS2_REAL_2026, split, skip })
      .filter((t) => !t.defunct && t.players.length >= 5 && !t.id.startsWith('__'));
    const field = world.map((t) => ({ t, s: teamSeasonToTTeam(t).strength })).sort((a, b) => b.s - a.s).slice(0, 15)
      .map(({ t }) => aiFor(t, 'legend'));
    const built = buildUserTeam('Dream', picks, coach);
    const tw = newOrgTeamwork(draftSynergy(built.players).total, split - 1);
    const user = { ...careerUserTeam(built, tw, coach), players: built.players.map((p) => ({ ...p, form: 1 })) };
    for (let e = 0; e < 3; e++) { titles += runEvent(user, field, 9000 + e * 104729 + split * 31) ? 1 : 0; events++; }
  }
  assert.ok(titles / events <= 0.25, `títulos ${titles}/${events} = ${pct(titles / events)}`);
});


// ─── mercado por modo ────────────────────────────────────────────────────────

test('mercado por modo: estrela "não está à venda" com mais frequência e ágio maior no Lendário', () => {
  const stars = ranked.flatMap((t) => t.players).filter((p) => playerOvr(p) >= 84);
  const nfs = (mode: 'normal' | 'hard' | 'legend') => stars.filter((p) => {
    const r = decideOffer({ offer: 1, asking: 1, marketValue: playerValue(p), player: p, fromTeamwork: 90, round: 0, ctx: { difficulty: mode } });
    return r.kind === 'reject' && r.firm;
  }).length;
  const [n, h, l] = [nfs('normal'), nfs('hard'), nfs('legend')];
  assert.ok(n < h && h < l, `não está à venda: normal ${n} · difícil ${h} · lendário ${l} (de ${stars.length})`);
  assert.equal(MARKET_BY_MODE.normal.coreRatio, 1.7, 'Normal = a regra de sempre');
  assert.ok(MARKET_BY_MODE.legend.coreRatio > MARKET_BY_MODE.hard.coreRatio);
});

test('free agent de calibre: 85+ recusa tier 3 e cobra luvas', () => {
  const base: NegoProfile = {
    playerId: 'x', ovr: 86, age: 25, marketWage: 200_000, marketValue: 3_000_000,
    hidden: { ambition: 12, loyalty: 10, professionalism: 10, temperament: 10 },
    clubTier: 3, squadRank: 0, kind: 'signing', split: 2,
  };
  assert.equal(willingToNegotiate({ ...base, freeAgent: true }).ok, false);
  assert.equal(willingToNegotiate({ ...base, freeAgent: true, clubTier: 2 }).ok, true);
  assert.equal(willingToNegotiate(base).ok, true, 'sem ser free agent, a regra de antes');
  const fa = demandFor({ ...base, clubTier: 2, freeAgent: true }).terms.signingBonus;
  const notFa = demandFor({ ...base, clubTier: 2 }).terms.signingBonus;
  assert.ok(fa - notFa >= 0.25 * base.marketValue, `luvas do free agent ${fa} × ${notFa}`);
});

test('IA no Lendário: orçamento maior e assina os free agents ≥ 80 antes de você', () => {
  const split = 2;
  const args = {
    teams: ranked, freeAgents: agedFreeAgents(CS2_REAL_2026, {}, split, new Set<string>()), split, kind: 'offseason' as const,
    formOf: () => 50, ageOf: (p: Player) => aiAgeOf(p, split), baseOvrOf, movableIds: BASE_PLAYER_IDS,
  };
  const normal = tickMarketWindow(args);
  const legend = tickMarketWindow({ ...args, ...AI_MARKET_BY_MODE.legend });
  const faSigned = (r: typeof normal) => r.log.filter((m) => m.fromId === '__free__' && m.ovr >= 80).length;
  assert.ok(faSigned(legend) > faSigned(normal), `free agents ≥80 assinados: lendário ${faSigned(legend)} × normal ${faSigned(normal)}`);
  const sum = (b: Record<string, number>) => Object.values(b).reduce((a, x) => a + x, 0);
  assert.ok(sum(legend.budgets) + legend.log.reduce((a, m) => a + m.fee, 0) > sum(normal.budgets), 'orçamento da IA maior no Lendário');
});
