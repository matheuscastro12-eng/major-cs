// [fase 3 · frente CONTRATOS] Regras dos contratos e da negociação em rodadas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateClube } from '../src/engine/clube/clubeMigration.ts';
import type { ClubeState, ContractTerms } from '../src/engine/clube/model.ts';
import {
  defaultContracts, materializeContracts, contractPayroll, contractUntilOf, contractUntilMap, releaseClauseOf, contractWageOf,
  signContract, withoutContracts, keepContracts, loyaltyPayouts, defaultTerms,
  demandFor, willingToNegotiate, openPlayerNegotiation, playerNegotiationStep, offerFromDemand, offerValue, currentDemand,
  agentOf, caliberTier, expectedStatus, expectedPlayTime, initialPatience, negoProfileFor,
  openClubNegotiation, clubNegotiationStep, decideRound, recordNegotiation, negotiationBlock, contractRows, expiryTimeline,
  WAGE_PENDING, type NegoProfile, type Offer,
} from '../src/engine/clube/contratos.ts';
import { decideOffer } from '../src/engine/career/decideOffer.ts';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import { playerWage, playerValue, playerOvr } from '../src/engine/ratings.ts';
import { defaultAge } from '../src/engine/attrs/model.ts';
import { measureMigration, measureDemand, measureTrajectory } from './measure-folha-contratos.mts';

const ids = Array.from({ length: 400 }, (_, i) => `t${i}`);
const NO_AGENT = ids.find((id) => !agentOf(id, 82).has)!;
const AGENT = ids.find((id) => agentOf(id, 82).has && agentOf(id, 82).style === 'fair')!;
const HARD = ids.find((id) => agentOf(id, 82).has && agentOf(id, 82).style === 'hard')!;

const prof = (over: Partial<NegoProfile> = {}): NegoProfile => ({
  playerId: NO_AGENT, ovr: 82, age: 25, marketWage: 100_000, marketValue: 1_200_000,
  hidden: { ambition: 12, loyalty: 10, professionalism: 10, temperament: 10 },
  clubTier: 2, squadRank: 1, kind: 'signing', split: 4, ...over,
  ...(over.hidden ? { hidden: { ambition: 12, loyalty: 10, professionalism: 10, temperament: 10, ...over.hidden } } : {}),
});
const find = (nick: string) => CS2_REAL_2026.flatMap((t) => t.players).find((p) => p.nick === nick)!;

// ─── migração e folha ──────────────────────────────────────────────────────
test('migração v29: contracts antigo vira termos completos com salário a materializar', () => {
  const c = defaultContracts({ contracts: { a: 5, b: 7, lixo: 'x' } });
  assert.deepEqual(Object.keys(c), ['a', 'b']);
  assert.equal(c.a.until, 5);
  assert.equal(c.a.wage, WAGE_PENDING);
  assert.equal(c.a.releaseClause, null, 'sem cláusula por padrão (neutro)');
  assert.equal(c.a.statusPromise, null);
  assert.equal(c.a.loyaltyBonus, 0);
});

test('folha real: o save migrado tem EXATAMENTE a folha de antes (playerWage) e materializar é idempotente', () => {
  const five = CS2_REAL_2026[0].players.slice(0, 5);
  const save = migrateClube({ contracts: Object.fromEntries(five.map((p) => [p.id, 5])), squad: five.map((p) => ({ playerId: p.id })) }) as { clube: ClubeState };
  const squad = five.map((p) => ({ id: p.id, marketWage: playerWage(p) }));
  const before = five.reduce((a, p) => a + playerWage(p), 0);
  assert.equal(contractPayroll(save, squad), before, 'antes de materializar o leitor cai no playerWage');
  const clube = materializeContracts(save, squad)!;
  assert.ok(clube, 'materializa na primeira vez');
  assert.equal(contractPayroll({ clube }, squad), before);
  for (const p of five) assert.equal(clube.contracts[p.id].wage, playerWage(p));
  assert.equal(materializeContracts({ clube }, squad), null, 'segunda vez não muda nada');
  // depois de materializado o salário NÃO flutua com o jogador (folha real)
  assert.equal(contractWageOf({ clube }, five[0].id, () => 999_999), playerWage(five[0]));
});

test('régua de migração em 60 elencos reais: diferença zero', () => {
  const m = measureMigration();
  assert.equal(m.before, m.after);
  assert.equal(m.maxDiff, 0);
});

test('materializar dobra entradas do contracts antigo que ainda não estão no bloco', () => {
  const clube = materializeContracts({ clube: migrateClube({}).clube as ClubeState, contracts: { z: 9 } }, [{ id: 'z', marketWage: 50_000 }])!;
  assert.equal(clube.contracts.z.until, 9);
  assert.equal(clube.contracts.z.wage, 50_000);
});

test('leitores: until, mapa, cláusula (frente I) e poda', () => {
  const s0 = { clube: migrateClube({}).clube as ClubeState };
  assert.equal(releaseClauseOf(s0, 'x'), null);
  const t: ContractTerms = { wage: 80_000, until: 6, signingBonus: 0, releaseClause: 2_000_000, statusPromise: 'key', loyaltyBonus: 0 };
  const clube = signContract(s0, 'x', t);
  assert.equal(releaseClauseOf({ clube }, 'x'), 2_000_000);
  assert.equal(contractUntilOf({ clube }, 'x'), 6);
  assert.deepEqual(contractUntilMap({ clube }), { x: 6 });
  assert.equal(clube.dressing.status.x, 'key', 'status prometido vai para o vestiário (frente G lê)');
  assert.equal(withoutContracts({ clube }, ['x']).contracts.x, undefined);
  assert.equal(keepContracts({ clube }, new Set()).contracts.x, undefined);
  assert.equal(releaseClauseOf({ clube: signContract(s0, 'y', { ...t, releaseClause: null }) }, 'y'), null);
});

test('bônus de lealdade só é pago a quem cumpre o contrato até o fim', () => {
  let clube = signContract({ clube: migrateClube({}).clube as ClubeState }, 'a', { ...defaultTerms(50_000, 1, 3), loyaltyBonus: 40_000 });
  clube = signContract({ clube }, 'b', { ...defaultTerms(50_000, 1, 4), loyaltyBonus: 40_000 });
  assert.deepEqual(loyaltyPayouts({ clube }, 3, ['a', 'b']), [{ playerId: 'a', amount: 40_000 }]);
  assert.deepEqual(loyaltyPayouts({ clube }, 3, ['b']), [], 'vendido antes do fim não recebe');
});

// ─── exigência ─────────────────────────────────────────────────────────────
test('exigência cresce com o CA (salário de mercado) e com a ambição', () => {
  assert.ok(demandFor(prof({ marketWage: 200_000 })).terms.wage > demandFor(prof({ marketWage: 100_000 })).terms.wage);
  assert.ok(demandFor(prof({ hidden: { ambition: 18 } as never })).terms.wage > demandFor(prof({ hidden: { ambition: 6 } as never })).terms.wage);
});

test('tier do seu clube: abaixo do nível dele custa mais; clube maior tem desconto de vitrine', () => {
  const at = demandFor(prof({ ovr: 86, clubTier: 1 })).terms.wage; // calibre 1 num tier 1
  const below = demandFor(prof({ ovr: 86, clubTier: 3 })).terms.wage;
  const above = demandFor(prof({ ovr: 74, clubTier: 1 })).terms.wage;
  const aboveAt = demandFor(prof({ ovr: 74, clubTier: 3 })).terms.wage;
  assert.ok(below > at, `${below} > ${at}`);
  assert.ok(above < aboveAt, `${above} < ${aboveAt}`);
  assert.equal(caliberTier(86), 1);
});

test('renovação: leal aceita menos; a lealdade não mexe na contratação', () => {
  const r = (loyalty: number) => demandFor(prof({ kind: 'renewal', hidden: { loyalty } as never, current: defaultTerms(100_000, 1) })).terms.wage;
  assert.ok(r(19) < r(3), `${r(19)} < ${r(3)}`);
  const s = (loyalty: number) => demandFor(prof({ hidden: { loyalty } as never })).terms.wage;
  assert.equal(s(19), s(3));
});

test('renovação neutra: sem agente, as luvas pedidas são 1 salário (o custo da renovação antiga)', () => {
  const d = demandFor(prof({ kind: 'renewal', current: defaultTerms(100_000, 1) }));
  assert.equal(d.terms.signingBonus, d.terms.wage);
});

test('renovação: não aceita corte grande do que já ganha', () => {
  const d = demandFor(prof({ kind: 'renewal', marketWage: 60_000, current: defaultTerms(150_000, 1) }));
  assert.ok(d.terms.wage + (d.terms.signingBonus! - d.terms.wage) / d.term >= 150_000 * 0.9);
  assert.ok(d.factors.some((f) => f.key === 'current'));
});

test('agente complica: pede luvas, tem menos paciência e menos rodadas', () => {
  const plain = prof({ playerId: NO_AGENT });
  const agent = prof({ playerId: AGENT });
  assert.equal(demandFor(plain).terms.signingBonus, 0);
  assert.ok((demandFor(agent).terms.signingBonus ?? 0) > 0);
  assert.ok(initialPatience(agent) < initialPatience(plain));
  assert.ok(openPlayerNegotiation(agent).nego.maxRounds < openPlayerNegotiation(plain).nego.maxRounds);
  assert.ok(initialPatience(prof({ playerId: HARD })) < initialPatience(agent));
});

test('status esperado pelo lugar no elenco e expectativa de tempo de jogo', () => {
  assert.equal(expectedStatus({ ovr: 88, age: 25, squadRank: 0 }), 'star');
  assert.equal(expectedStatus({ ovr: 75, age: 25, squadRank: 0 }), 'key');
  assert.equal(expectedStatus({ ovr: 75, age: 25, squadRank: 4 }), 'starter');
  assert.equal(expectedStatus({ ovr: 70, age: 19, squadRank: 4 }), 'prospect');
  assert.equal(expectedStatus({ ovr: 70, age: 25, squadRank: 6 }), 'backup');
  assert.ok(expectedPlayTime('star') > expectedPlayTime('starter'));
  assert.ok(expectedPlayTime('starter') > expectedPlayTime('backup'));
});

// ─── disposição ────────────────────────────────────────────────────────────
test('ambicioso em time pequeno: recusa (2 níveis abaixo) ou exige cláusula baixa (1 nível)', () => {
  const refuse = willingToNegotiate(prof({ ovr: 88, clubTier: 3, hidden: { ambition: 17 } as never }));
  assert.equal(refuse.ok, false);
  const d = demandFor(prof({ ovr: 88, clubTier: 2, hidden: { ambition: 14 } as never }));
  assert.ok(d.maxClause != null && d.maxClause > 0, 'exige cláusula');
  assert.equal(demandFor(prof({ ovr: 88, clubTier: 1, hidden: { ambition: 14 } as never })).maxClause, null, 'no clube do nível dele não exige');
});

test('renovação: contrato vencendo com status rebaixado → não renova', () => {
  const current: ContractTerms = { ...defaultTerms(100_000, 1), statusPromise: 'key' };
  assert.equal(willingToNegotiate(prof({ kind: 'renewal', current, currentStatus: 'rotation' })).ok, false);
  assert.equal(willingToNegotiate(prof({ kind: 'renewal', current, currentStatus: 'key' })).ok, true);
  const opened = openPlayerNegotiation(prof({ kind: 'renewal', current, currentStatus: 'backup' }));
  assert.equal(opened.nego.status, 'rejected');
  assert.ok(opened.refused);
});

test('renovação: insatisfeito e sem apego quer sair; muito leal ainda conversa', () => {
  assert.equal(willingToNegotiate(prof({ kind: 'renewal', morale: 15, hidden: { loyalty: 8 } as never })).ok, false);
  assert.equal(willingToNegotiate(prof({ kind: 'renewal', morale: 15, hidden: { loyalty: 17 } as never })).ok, true);
});

// ─── rodadas ───────────────────────────────────────────────────────────────
const demandOffer = (p: NegoProfile): Offer => offerFromDemand(demandFor(p), p.split);

test('aceitar a exigência fecha na primeira rodada', () => {
  const p = prof();
  const { nego } = openPlayerNegotiation(p);
  const r = playerNegotiationStep(p, nego, demandOffer(p));
  assert.equal(r.reply.kind, 'accept');
  assert.equal(r.nego.status, 'accepted');
  assert.equal(r.nego.offer.wage, demandFor(p).terms.wage);
});

test('proposta baixa gasta paciência; insistir rompe; proposta ofensiva rompe na hora', () => {
  const p = prof();
  let { nego } = openPlayerNegotiation(p);
  const low: Offer = { ...demandOffer(p), wage: Math.round(demandFor(p).terms.wage * 0.75) };
  const r1 = playerNegotiationStep(p, nego, low);
  assert.equal(r1.reply.kind, 'counter');
  assert.ok(r1.nego.patience < nego.patience);
  assert.ok(r1.reply.issues.includes('wage'));
  nego = r1.nego;
  let last = r1;
  for (let i = 0; i < 6 && last.nego.status === 'open'; i++) { last = playerNegotiationStep(p, nego, low); nego = last.nego; }
  assert.equal(last.nego.status, 'rejected', 'rompe por paciência');
  assert.equal(last.reply.kind, 'walkout');
  const insult = playerNegotiationStep(p, openPlayerNegotiation(p).nego, { ...demandOffer(p), wage: 40_000 });
  assert.equal(insult.reply.kind, 'walkout', 'menos da metade do pedido: rompe na hora');
});

test('contraproposta: a exigência nunca sobe e nunca cai abaixo do piso', () => {
  const p = prof({ playerId: AGENT, ovr: 84 });
  const opening = demandFor(p).terms.wage;
  let { nego } = openPlayerNegotiation(p);
  let prev = opening;
  for (let i = 0; i < 3 && nego.status === 'open'; i++) {
    const r = playerNegotiationStep(p, nego, { ...demandOffer(p), wage: Math.round(opening * 0.9) });
    nego = r.nego;
    if (r.reply.kind !== 'counter') break;
    assert.ok(nego.demand.wage! <= prev);
    assert.ok(nego.demand.wage! >= Math.round((opening * 0.93) / 5000) * 5000 - 5000);
    prev = nego.demand.wage!;
  }
});

test('barganha paciente fecha abaixo da exigência de abertura', () => {
  const p = prof({ marketWage: 150_000 });
  const opening = demandFor(p).terms.wage;
  let { nego } = openPlayerNegotiation(p);
  let f = 0.9;
  let accepted = 0;
  for (let i = 0; i < 5 && nego.status === 'open'; i++) {
    const r = playerNegotiationStep(p, nego, { ...demandOffer(p), wage: Math.round(currentDemand(p, nego).terms.wage * f / 5000) * 5000 });
    nego = r.nego;
    if (r.reply.kind === 'accept') accepted = nego.offer.wage!;
    f += 0.03;
  }
  assert.ok(accepted > 0 && accepted < opening, `${accepted} < ${opening}`);
});

test('fim das rodadas: expira (vai ouvir outras propostas)', () => {
  const p = prof({ hidden: { temperament: 20, professionalism: 20 } as never });
  let nego = { ...openPlayerNegotiation(p).nego, maxRounds: 2 };
  const near: Offer = { ...demandOffer(p), wage: Math.round(demandFor(p).terms.wage * 0.85) };
  const r1 = playerNegotiationStep(p, nego, near);
  assert.equal(r1.reply.kind, 'counter');
  nego = r1.nego;
  const r2 = playerNegotiationStep(p, nego, near);
  assert.equal(r2.reply.kind, 'expired');
  assert.equal(r2.nego.status, 'expired');
  assert.ok(r2.nego.patience > 0, 'expirou com paciência sobrando');
});

test('cláusula exigida é regra dura; cláusula baixa facilita a assinatura', () => {
  const p = prof({ ovr: 88, clubTier: 2, hidden: { ambition: 14 } as never, marketValue: 2_000_000 });
  const d = demandFor(p);
  assert.ok(d.maxClause);
  const rich: Offer = { ...offerFromDemand(d, p.split), wage: d.terms.wage * 2, releaseClause: null };
  const r = playerNegotiationStep(p, openPlayerNegotiation(p).nego, rich);
  assert.equal(r.reply.kind, 'counter', 'dinheiro não compra a cláusula');
  assert.ok(r.reply.issues.includes('clause'));
  // jogador sem exigência de cláusula: cláusula baixa vale como crédito
  const q = prof({ hidden: { ambition: 16 } as never });
  const dq = demandFor(q);
  const base: Offer = { ...offerFromDemand(dq, q.split), releaseClause: null };
  assert.ok(offerValue(q, dq, { ...base, releaseClause: q.marketValue }) > offerValue(q, dq, base));
  const lowWage: Offer = { ...base, wage: Math.round(dq.terms.wage * 0.9) };
  assert.equal(playerNegotiationStep(q, openPlayerNegotiation(q).nego, lowWage).reply.kind, 'counter');
  assert.equal(playerNegotiationStep(q, openPlayerNegotiation(q).nego, { ...lowWage, releaseClause: Math.round(q.marketValue * 0.8) }).reply.kind, 'accept');
});

test('status: prometer mais ajuda; 2 níveis abaixo trava o ambicioso', () => {
  const p = prof({ squadRank: 0, ovr: 84, hidden: { ambition: 14 } as never });
  const d = demandFor(p);
  assert.equal(d.wantedStatus, 'star');
  const base = offerFromDemand(d, p.split);
  assert.ok(offerValue(p, d, { ...base, statusPromise: 'rotation' }) < offerValue(p, d, base));
  const r = playerNegotiationStep(p, openPlayerNegotiation(p).nego, { ...base, wage: base.wage * 1.5, statusPromise: 'starter' });
  assert.equal(r.reply.kind, 'counter');
  assert.ok(r.reply.issues.includes('status'));
  const q = prof({ squadRank: 3 });
  const dq = demandFor(q);
  assert.ok(offerValue(q, dq, { ...offerFromDemand(dq, q.split), statusPromise: 'key' }) > offerValue(q, dq, offerFromDemand(dq, q.split)));
});

test('bônus de lealdade vale mais para o jogador leal', () => {
  const val = (loyalty: number) => {
    const p = prof({ hidden: { loyalty } as never });
    const d = demandFor(p);
    const o = offerFromDemand(d, p.split);
    return offerValue(p, d, { ...o, loyaltyBonus: 100_000 }) - offerValue(p, d, o);
  };
  assert.ok(val(18) > val(4));
});

test('determinístico: mesma entrada, mesma negociação', () => {
  const p = prof({ playerId: HARD, ovr: 86 });
  const run = () => {
    let { nego } = openPlayerNegotiation(p);
    const out: unknown[] = [];
    for (let i = 0; i < 4 && nego.status === 'open'; i++) { const r = playerNegotiationStep(p, nego, { ...demandOffer(p), wage: 70_000 + i * 10_000 }); nego = r.nego; out.push(r.reply, nego); }
    return JSON.stringify(out);
  };
  assert.equal(run(), run());
});

// ─── clube dono ────────────────────────────────────────────────────────────
test('clube dono em rodadas por cima do decideOffer: contraproposta gasta paciência, aceite fecha', () => {
  const p = find('ropz');
  const asking = playerValue(p) * 1.4;
  let nego = openClubNegotiation({ playerId: p.id, split: 3, asking });
  const offer = Math.round(asking * 0.75);
  const reply = decideOffer({ offer, asking, marketValue: playerValue(p), player: p, fromTeamwork: 80, round: decideRound(nego) });
  nego = clubNegotiationStep(nego, offer, reply);
  if (reply.kind === 'counter') {
    assert.ok(nego.patience < 100);
    assert.equal(nego.round, 2);
    assert.equal(nego.demand.fee, reply.value);
    const acc = decideOffer({ offer: reply.value, asking, marketValue: playerValue(p), player: p, fromTeamwork: 80, round: decideRound(nego) });
    assert.equal(acc.kind, 'accept');
    nego = clubNegotiationStep(nego, reply.value, acc);
    assert.equal(nego.status, 'accepted');
  } else {
    assert.notEqual(nego.status, 'open');
  }
  assert.equal(clubNegotiationStep(openClubNegotiation({ playerId: 'x', split: 1, asking: 100 }), 10, { kind: 'reject', firm: true, msg: '' }).status, 'rejected');
  let n = openClubNegotiation({ playerId: 'x', split: 1, asking: 1_000_000 });
  for (let i = 0; i < 10 && n.status === 'open'; i++) n = clubNegotiationStep(n, 950_000, { kind: 'counter', value: 1_000_000 });
  assert.equal(n.status, 'expired', 'acabaram as rodadas');
});

test('conversa rompida bloqueia até o próximo split', () => {
  const s = { clube: migrateClube({}).clube as ClubeState };
  const p = prof();
  const { nego } = openPlayerNegotiation(p);
  const clube = recordNegotiation(s, { ...nego, status: 'rejected' });
  assert.ok(negotiationBlock({ clube }, p.playerId, 'player', p.split));
  assert.equal(negotiationBlock({ clube }, p.playerId, 'player', p.split + 1), null);
  assert.equal(negotiationBlock({ clube }, p.playerId, 'club', p.split), null);
  const again = recordNegotiation({ clube }, { ...nego, split: p.split + 1, status: 'accepted' });
  assert.equal(again.negotiations.length, 1, 'poda splits antigos');
});

// ─── jogadores reais e aba ─────────────────────────────────────────────────
test('jogadores reais: perfil pela fonte da verdade e exigência perto do salário de mercado', () => {
  for (const nick of ['ZywOo', 'sh1ro', 'karrigan']) {
    const p = find(nick);
    const pr = negoProfileFor(p, { age: p.age ?? defaultAge(p.id), clubTier: caliberTier(playerOvr(p)), squadOvrs: [80, 79, 78, 77], kind: 'signing', split: 2 });
    const d = demandFor(pr);
    const pkg = d.terms.wage + (d.terms.signingBonus ?? 0) / d.term;
    assert.ok(pkg / playerWage(p) > 0.85 && pkg / playerWage(p) < 1.2, `${nick}: ${pkg} × ${playerWage(p)}`);
  }
});

test('aba Contratos: linhas com salário × mercado e linha do tempo de vencimentos', () => {
  let clube = signContract({ clube: migrateClube({}).clube as ClubeState }, 'a', defaultTerms(100_000, 3, 1));
  clube = signContract({ clube }, 'b', { ...defaultTerms(80_000, 3, 3), wage: 120_000 });
  const rows = contractRows({ clube }, 3, [{ id: 'a', marketWage: 100_000 }, { id: 'b', marketWage: 80_000 }]);
  assert.equal(rows[0].expiring, true);
  assert.equal(rows[0].canRenew, true);
  assert.equal(rows[1].canRenew, false);
  assert.ok(Math.abs(rows[1].vsMarket - 0.5) < 1e-9);
  assert.deepEqual(expiryTimeline(rows).map((g) => g.until), [3, 5]);
});

// ─── calibração ────────────────────────────────────────────────────────────
test('calibração: contratar no tier do nível e renovar custam o mesmo que antes (±6%); 9 splits ±5%', () => {
  const dem = measureDemand();
  const level = dem['contratação · tier do nível dele'];
  assert.ok(level.acceptCost > 0.97 && level.acceptCost < 1.06, `aceitar ${level.acceptCost}`);
  assert.ok(level.haggleCost <= level.acceptCost);
  const ren = dem['renovação'];
  assert.ok(ren.acceptCost > 0.95 && ren.acceptCost < 1.05, `renovação ${ren.acceptCost}`);
  const tr = measureTrajectory();
  assert.ok(tr.ratio > 0.95 && tr.ratio < 1.05, `trajetória ${tr.ratio}`);
});
