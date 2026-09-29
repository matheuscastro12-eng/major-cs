// FOLHA REAL DA FASE 3 (frente CONTRATOS) — a régua de neutralidade econômica.
//
// Antes da fase 3 o salário de cada jogador era `playerWage(jogador atual)`,
// recalculado a cada render (subia/descia junto com a evolução) e a renovação
// custava 1 salário. Agora o salário vem do CONTRATO (fixo até renovar) e é
// negociado em rodadas. Esta régua mede:
//
//   1. MIGRAÇÃO — save com o `contracts` antigo migrado para `clube.contracts`
//      e materializado: a folha tem que ser IDÊNTICA à de antes (elencos reais).
//   2. EXIGÊNCIA — exigência de abertura ÷ playerWage no mercado real (todo
//      jogador do dataset), por tier do seu clube, contratação e renovação.
//   3. NEGOCIAÇÃO — o que fecha: quem aceita a exigência na hora × quem barganha
//      (abre em 88% e sobe 3% por rodada), em custo por split (salário + luvas
//      diluídas na duração) ÷ custo de antes.
//   4. TRAJETÓRIA — 9 splits de um elenco real evoluindo (evolveAttrs): folha
//      antiga (flutua com o jogador, renovação = 1 salário) × folha real
//      (contrato fixo, renova na exigência negociada).
//
//   npx tsx scripts/measure-folha-contratos.mts [--json]

import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import { playerOvr, playerWage } from '../src/engine/ratings.ts';
import { attrsOf, defaultAge, withAttrs } from '../src/engine/attrs/model.ts';
import { evolveAttrs } from '../src/engine/attrs/progression.ts';
import { migrateClube } from '../src/engine/clube/clubeMigration.ts';
import {
  materializeContracts, contractPayroll, negoProfileFor, demandFor, openPlayerNegotiation, playerNegotiationStep,
  offerFromDemand, termsFromOffer, caliberTier, type NegoProfile, type Offer,
} from '../src/engine/clube/contratos.ts';
import type { Player } from '../src/types.ts';

const ageOf = (p: Player) => (typeof p.age === 'number' ? p.age : defaultAge(p.id));
const teams = CS2_REAL_2026.filter((t) => t.players.length >= 5);

// ─── 1. migração ───
export function measureMigration(): { squads: number; before: number; after: number; maxDiff: number } {
  let before = 0, after = 0, maxDiff = 0, n = 0;
  for (const t of teams.slice(0, 60)) {
    const five = t.players.slice(0, 5);
    const save = { contracts: Object.fromEntries(five.map((p, i) => [p.id, 2 + (i % 3)])), squad: five.map((p) => ({ playerId: p.id })) };
    const migrated = migrateClube(save) as { clube: NonNullable<Parameters<typeof contractPayroll>[0]['clube']> };
    const squad = five.map((p) => ({ id: p.id, marketWage: playerWage(p) }));
    const clube = materializeContracts(migrated, squad) ?? migrated.clube;
    const b = five.reduce((a, p) => a + playerWage(p), 0);
    const a = contractPayroll({ clube }, squad);
    before += b; after += a; n++;
    maxDiff = Math.max(maxDiff, Math.abs(a - b));
  }
  return { squads: n, before, after, maxDiff };
}

// ─── 2/3. exigência e negociação ───
function profile(p: Player, clubTier: number, kind: NegoProfile['kind'], split = 4, squadOvrs: number[] = [], current?: NegoProfile['current']): NegoProfile {
  return negoProfileFor(p, { age: ageOf(p), clubTier, squadOvrs, kind, split, current: current ?? null, morale: 60 });
}
const costPerSplit = (o: Offer) => o.wage + o.signingBonus / o.term;

/** Barganha simples: abre em 88% do salário pedido (resto igual à exigência), sobe 3% por rodada (passos de R$ 1k). */
export function haggle(p: NegoProfile): { offer: Offer; rounds: number; outcome: string } {
  const opened = openPlayerNegotiation(p);
  if (opened.refused) return { offer: offerFromDemand(opened.demand, p.split), rounds: 0, outcome: 'refused' };
  let nego = opened.nego;
  let wageF = 0.88;
  for (let i = 0; i < 8; i++) {
    const d = demandFor(p);
    const base = offerFromDemand(d, p.split);
    const offer: Offer = { ...base, wage: Math.round((nego.demand.wage ?? d.terms.wage) * wageF / 1000) * 1000, signingBonus: nego.demand.signingBonus ?? base.signingBonus };
    const r = playerNegotiationStep(p, nego, offer);
    nego = r.nego;
    if (r.reply.kind === 'accept') return { offer, rounds: i + 1, outcome: 'accept' };
    if (r.reply.kind !== 'counter') {
      // rompeu/expirou: quem barganha paga a exigência de abertura noutra janela
      return { offer: offerFromDemand(d, p.split), rounds: i + 1, outcome: r.reply.kind };
    }
    wageF = Math.min(1, wageF + 0.03);
  }
  return { offer: offerFromDemand(demandFor(p), p.split), rounds: 8, outcome: 'loop' };
}

export function measureDemand() {
  const pool = CS2_REAL_2026.flatMap((t) => t.players).filter((p) => playerOvr(p) >= 60);
  const rows: Record<string, { n: number; demand: number; accept: number; haggle: number; walk: number; refused: number }> = {};
  const bump = (k: string, d: number, acc: number, hg: number, walk: boolean, refused: boolean) => {
    const r = rows[k] ?? (rows[k] = { n: 0, demand: 0, accept: 0, haggle: 0, walk: 0, refused: 0 });
    r.n++; r.demand += d; r.accept += acc; r.haggle += hg; r.walk += walk ? 1 : 0; r.refused += refused ? 1 : 0;
  };
  for (const p of pool) {
    const mw = playerWage(p);
    const caliber = playerOvr(p) >= 85 ? 1 : playerOvr(p) >= 78 ? 2 : 3;
    for (const tier of [1, 2, 3]) {
      const pr = profile(p, tier, 'signing');
      const d = demandFor(pr);
      const acc = costPerSplit(offerFromDemand(d, pr.split));
      const h = haggle(pr);
      const key = tier === caliber ? 'contratação · tier do nível dele' : tier < caliber ? 'contratação · clube acima do nível' : 'contratação · clube abaixo do nível';
      bump(key, d.terms.wage / mw, acc / mw, costPerSplit(h.offer) / mw, h.outcome === 'walkout' || h.outcome === 'expired', h.outcome === 'refused');
      if (playerOvr(p) >= 75 && tier === caliber) bump('contratação · OVR 75+ no tier do nível', d.terms.wage / mw, acc / mw, costPerSplit(h.offer) / mw, h.outcome === 'walkout' || h.outcome === 'expired', h.outcome === 'refused');
      bump(`contratação · tier ${tier} (todos)`, d.terms.wage / mw, acc / mw, costPerSplit(h.offer) / mw, h.outcome === 'walkout' || h.outcome === 'expired', h.outcome === 'refused');
    }
    // renovação no tier do nível dele, ganhando hoje o salário de mercado.
    // Custo de antes: salário + 1 salário de renovação a cada 3 splits.
    const cur = { wage: mw, until: 3, signingBonus: 0, releaseClause: null, statusPromise: null, loyaltyBonus: 0 };
    const pr = profile(p, caliber, 'renewal', 4, [], cur);
    const d = demandFor(pr);
    const before = mw + mw / 3;
    const h = haggle(pr);
    bump('renovação', d.terms.wage / mw, costPerSplit(offerFromDemand(d, pr.split)) / before, costPerSplit(h.offer) / before, h.outcome === 'walkout' || h.outcome === 'expired', h.outcome === 'refused');
  }
  return Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, {
    n: r.n, demand: r.demand / r.n, acceptCost: r.accept / r.n, haggleCost: r.haggle / r.n, walkShare: r.walk / r.n, refusedShare: r.refused / r.n,
  }]));
}

// ─── 4. trajetória ───
export function measureTrajectory(splits = 9) {
  let legacyTotal = 0, contractTotal = 0;
  for (const t of teams.slice(0, 40)) {
    let squad = t.players.slice(0, 5).map((p) => ({ p: withAttrs(p, attrsOf(p)), age0: ageOf(p) }));
    const tier = caliberTier(squad.reduce((a, x) => a + playerOvr(x.p), 0) / 5); // clube do nível do elenco
    // contrato inicial = migrado (salário de mercado hoje), vencimentos escalonados
    const contracts = new Map(squad.map((x, i) => [x.p.id, { wage: playerWage(x.p), until: 1 + (i % 3) }]));
    for (let split = 1; split <= splits; split++) {
      for (const x of squad) {
        legacyTotal += playerWage(x.p);
        contractTotal += contracts.get(x.p.id)!.wage;
      }
      // renovação no fim do contrato (antes: 1 salário; agora: negociada)
      for (const x of squad) {
        const c = contracts.get(x.p.id)!;
        if (c.until !== split) continue;
        legacyTotal += playerWage(x.p);
        const pr = negoProfileFor(x.p, {
          age: x.age0 + Math.floor((split - 1) / 3), clubTier: tier, squadOvrs: squad.filter((y) => y !== x).map((y) => playerOvr(y.p)),
          kind: 'renewal', split: split + 1, current: { ...c, signingBonus: 0, releaseClause: null, statusPromise: null, loyaltyBonus: 0 }, morale: 60,
        });
        const h = haggle(pr);
        contractTotal += h.offer.signingBonus;
        const terms = termsFromOffer(h.offer, split + 1);
        contracts.set(x.p.id, { wage: terms.wage, until: terms.until });
      }
      // evolução do split
      squad = squad.map((x) => {
        const age = x.age0 + Math.floor((split - 1) / 3);
        const r = evolveAttrs(attrsOf(x.p), { playerId: x.p.id, split, age, role: x.p.role });
        return { ...x, p: withAttrs(x.p, r.attrs) };
      });
    }
  }
  return { splits, legacyTotal, contractTotal, ratio: contractTotal / legacyTotal };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mig = measureMigration();
  const dem = measureDemand();
  const tr = measureTrajectory();
  if (process.argv.includes('--json')) console.log(JSON.stringify({ mig, dem, tr }, null, 2));
  else {
    const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
    const m = (v: number) => `R$ ${(v / 1000).toFixed(0)}k`;
    console.log(`1. MIGRAÇÃO (${mig.squads} elencos reais): folha antes ${m(mig.before)} · depois ${m(mig.after)} · maior diferença por elenco ${m(mig.maxDiff)}`);
    console.log('2/3. EXIGÊNCIA E NEGOCIAÇÃO (÷ custo de antes por split)');
    for (const [k, r] of Object.entries(dem)) {
      console.log(`   ${k.padEnd(40)} n=${String(r.n).padStart(4)}  exige ${pct(r.demand)} do salário · aceitar na hora ${pct(r.acceptCost)} · barganhando ${pct(r.haggleCost)} · rompe ${pct(r.walkShare)} · recusa ${pct(r.refusedShare)}`);
    }
    console.log(`4. TRAJETÓRIA (${tr.splits} splits, 40 elencos): folha antiga ${m(tr.legacyTotal)} · folha real ${m(tr.contractTotal)} · razão ${pct(tr.ratio)}`);
  }
}
