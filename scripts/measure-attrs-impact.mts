// [realismo FM · frente B] MEDIÇÃO do impacto dos atributos como fonte da verdade.
// Roda: `npx tsx scripts/measure-attrs-impact.mts [caminho/para/player-attrs.json]`
//
// Compara ANTES (5 números legados) × DEPOIS (números saindo dos atributos):
//   1. base de jogadores: OVR, valor e salário;
//   2. Ultimate: OVR, raridade e preço de cada carta do catálogo do mês;
//   3. saves de exemplo da Carreira (v26 com evo escalar → v27 com attrEvo);
//   4. Road to Pro: os 5 números e o OVR do herói;
//   5. evolução: trajetória de OVR em 12 splits, sistema antigo × novo.
// Com um arquivo de atributos reais (frente de dados) como argumento, repete 1–2
// aplicando essa base — mostra quanto o OVR/preço mudaria na integração.
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import ages from '../src/data/bo3-ages.json' with { type: 'json' };
import { materializeTeams, normalizeAttrsDb, readAttrsFile } from '../src/data/playerAttrs.ts';
import {
  attrsOf, caFromOvr, defaultAge, legacyFromAttrs, ovrFromAttrs, potentialOvrFor, type LegacyStats,
} from '../src/engine/attrs/model.ts';
import { evolveAttrs } from '../src/engine/attrs/progression.ts';
import { applyAttrDelta } from '../src/engine/career/attrEvo.ts';
import { migrateSave } from '../src/state/saveMigrations.ts';
import { playerOvr, playerValue } from '../src/engine/ratings.ts';
import { buildFullCatalog } from '../src/engine/ultimate/catalog.ts';
import { estimateCardValue } from '../src/engine/ultimate/cards.ts';
import { monthIndex } from '../src/engine/ultimate/promos.ts';
import { createRtpSave } from '../src/engine/rtp/createSave.ts';
import { proOvr } from '../src/engine/rtp/coreStats.ts';
import { computeOvrFromAttributes, type AttrKey } from '../src/engine/attributes.ts';
import { hashStr } from '../src/state/hash.ts';
import type { Player, Role, TeamSeason } from '../src/types.ts';

const oldOvr = (p: LegacyStats) => {
  const spec = Math.max(p.awp, p.igl, p.aim);
  return Math.round(p.aim * 0.45 + p.consistency * 0.18 + p.clutch * 0.12 + spec * 0.25);
};
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const pct = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const dist = (a: number[]) => `média ${mean(a).toFixed(2)} dp ${sd(a).toFixed(2)} p10 ${pct(a, 0.1)} p50 ${pct(a, 0.5)} p90 ${pct(a, 0.9)}`;
const deltaLine = (d: number[]) => `Δ média ${mean(d).toFixed(3)} | |Δ| média ${mean(d.map(Math.abs)).toFixed(3)} | máx |Δ| ${Math.max(0, ...d.map(Math.abs))} | ≠0 em ${d.filter((x) => x !== 0).length}/${d.length}`;
const legacyOfRaw = (p: LegacyStats): LegacyStats => ({ aim: p.aim, awp: p.awp, igl: p.igl, clutch: p.clutch, consistency: p.consistency });

// JSON cru (antes da materialização) = o "antes" da base
const RAW = (await import('../src/data/bo3-2026.json', { with: { type: 'json' } })).default as unknown as TeamSeason[];
const rawById = new Map(RAW.flatMap((t) => t.players.map((p) => [p.id, p] as const)));

function section(title: string) { console.log(`\n## ${title}`); }

function measureDataset(label: string, teams: TeamSeason[]) {
  section(`1. Base de jogadores (${label})`);
  const before: number[] = [], after: number[] = [], dOvr: number[] = [], dVal: number[] = [];
  for (const p of teams.flatMap((t) => t.players)) {
    const raw = rawById.get(p.id);
    if (!raw) continue;
    const o0 = oldOvr(raw), o1 = playerOvr(p);
    before.push(o0); after.push(o1); dOvr.push(o1 - o0);
    const v0 = playerValue({ ...legacyOfRaw(raw), nick: raw.nick }), v1 = playerValue(p);
    dVal.push(v0 ? (v1 - v0) / v0 : 0);
  }
  console.log(`jogadores: ${before.length}`);
  console.log(`OVR antes:  ${dist(before)}`);
  console.log(`OVR depois: ${dist(after)}`);
  console.log(`OVR ${deltaLine(dOvr)}`);
  console.log(`valor de mercado: Δ% médio ${(mean(dVal) * 100).toFixed(2)}% | |Δ%| médio ${(mean(dVal.map(Math.abs)) * 100).toFixed(2)}%`);

  section(`2. Ultimate — catálogo do mês (${label})`);
  const mi = monthIndex(new Date(Date.UTC(2026, 8, 15)));
  const now = buildFullCatalog(teams, mi).catalog;
  const ref = buildFullCatalog(RAW.map((t) => ({ ...t, players: t.players.map((p) => ({ ...p })) })), mi).catalog;
  const refByPid = new Map<string, (typeof ref)[number]>();
  for (const c of ref) if (!refByPid.has(`${c.playerId}|${c.rarity}`)) refByPid.set(`${c.playerId}|${c.rarity}`, c);
  const refBase = new Map(ref.filter((c) => ['bronze', 'silver', 'gold', 'rareGold', 'elite', 'legendary', 'icon'].includes(c.rarity)).map((c) => [c.playerId, c]));
  const dO: number[] = [], dP: number[] = [];
  let rarityChanged = 0, n = 0;
  for (const c of now) {
    const isBase = ['bronze', 'silver', 'gold', 'rareGold', 'elite', 'legendary', 'icon'].includes(c.rarity);
    const r = isBase ? refBase.get(c.playerId) : refByPid.get(`${c.playerId}|${c.rarity}`);
    if (!r) continue;
    n++;
    dO.push(c.ovr - r.ovr);
    const p0 = estimateCardValue(r.ovr, r.rarity), p1 = estimateCardValue(c.ovr, c.rarity);
    dP.push(p0 ? (p1 - p0) / p0 : 0);
    if (c.rarity !== r.rarity) rarityChanged++;
  }
  console.log(`cartas comparadas: ${n}`);
  console.log(`OVR da carta ${deltaLine(dO)}`);
  console.log(`preço estimado: Δ% médio ${(mean(dP) * 100).toFixed(2)}% | |Δ%| médio ${(mean(dP.map(Math.abs)) * 100).toFixed(2)}% | máx |Δ%| ${(Math.max(0, ...dP.map(Math.abs)) * 100).toFixed(1)}%`);
  console.log(`cartas base que mudariam de raridade: ${rarityChanged} (cobertas pelo apelido do CardIndex)`);
}

measureDataset('atributos derivados (sem a base real)', CS2_REAL_2026);
const dbPath = process.argv[2];
if (dbPath) {
  const db = normalizeAttrsDb(readAttrsFile(new URL(dbPath, `file://${process.cwd()}/`)));
  console.log(`\n(base real de atributos: ${Object.keys(db).length} jogadores de ${dbPath})`);
  measureDataset('com a base real informada', materializeTeams(RAW, db));
}

// ── 3. Saves de exemplo da Carreira ─────────────────────────────────────────
section('3. Carreira — saves de exemplo (v26 → v27)');
{
  const pool = CS2_REAL_2026.flatMap((t) => t.players).filter((p) => p.role);
  const before: number[] = [], after: number[] = [], d: number[] = [];
  let saves = 0;
  for (let s = 0; s < 60; s++) {
    const squad = [0, 1, 2, 3, 4, 5].map((i) => pool[hashStr(`sq:${s}:${i}`) % pool.length]);
    const evo: Record<string, number> = {};
    const bias: Record<string, Partial<Record<keyof LegacyStats, number>>> = {};
    for (const p of squad) {
      evo[p.id] = (hashStr(`e:${s}:${p.id}`) % 15) - 6; // −6..+8
      if (hashStr(`b:${s}:${p.id}`) % 3 === 0) bias[p.id] = { aim: 1 + (hashStr(`bb:${p.id}`) % 3) };
    }
    const v26 = { _v: 26, split: 10, squad: squad.map((p) => ({ playerId: p.id, fromId: 'x', playerSnapshot: { ...p } })), evo, evoAttrBias: bias };
    const m = migrateSave(v26) as { attrEvo: Record<string, Partial<Record<AttrKey, number>>> };
    saves++;
    for (const p of squad) {
      const clamp = (v: number) => Math.max(40, Math.min(99, v));
      const b = bias[p.id] ?? {};
      const old: LegacyStats = {
        aim: clamp(p.aim + evo[p.id] + (b.aim ?? 0)), awp: clamp(p.awp + evo[p.id] + (b.awp ?? 0)), igl: clamp(p.igl + evo[p.id] + (b.igl ?? 0)),
        clutch: clamp(p.clutch + evo[p.id] + (b.clutch ?? 0)), consistency: clamp(p.consistency + evo[p.id] + (b.consistency ?? 0)),
      };
      const nw = applyAttrDelta(attrsOf(p), m.attrEvo[p.id]);
      before.push(oldOvr(old)); after.push(ovrFromAttrs(nw)); d.push(ovrFromAttrs(nw) - oldOvr(old));
    }
  }
  console.log(`saves: ${saves} · jogadores de elenco: ${before.length}`);
  console.log(`OVR antes (evo escalar):  ${dist(before)}`);
  console.log(`OVR depois (attrEvo):     ${dist(after)}`);
  console.log(`OVR ${deltaLine(d)}`);
}

// ── 4. Road to Pro ──────────────────────────────────────────────────────────
section('4. Road to Pro — herói');
{
  const roles: Role[] = ['AWP', 'IGL', 'Rifler', 'Entry', 'Support', 'Lurker'];
  const archs = ['aimstar', 'tactician', 'clutchgod', 'allrounder'] as const;
  const dL: number[] = [], dO: number[] = [], shown: number[] = [];
  for (let i = 0; i < 240; i++) {
    const save = createRtpSave({ nick: `h${i}`, country: 'br', role: roles[i % 6], personality: 'leader', archetype: archs[i % 4], age: 16 + (i % 3), categoryPoints: { mechanical: i % 5, mental: (i >> 1) % 5, physical: (i >> 2) % 3 }, seed: 1000 + i });
    for (const grow of [0, 3, 6]) {
      const a = Object.fromEntries(Object.entries(save.player.attrs).map(([k, v]) => [k, Math.min(20, v + grow)])) as Record<AttrKey, number>;
      // antes: média simples por grupo (coreStats antigo)
      const avg = (ks: AttrKey[]) => Math.round((ks.reduce((s, k) => s + a[k], 0) / ks.length) * 5);
      const old: LegacyStats = {
        aim: avg(['aim', 'aimMovement', 'tap', 'spray', 'headshot', 'crosshair', 'preAim']),
        clutch: avg(['clutch', 'composure', 'anticipation', 'offAngles']),
        consistency: avg(['consistency', 'concentration', 'discipline', 'positioning']),
        awp: avg(['awp']),
        igl: avg(['leadership', 'communication', 'gameSense', 'decisions', 'vision']),
      };
      const nw = legacyFromAttrs({ v: 1, a, h: save.player.hidden!, ca: 1, pa: 1 });
      for (const k of ['aim', 'awp', 'igl', 'clutch', 'consistency'] as const) dL.push(nw[k] - old[k]);
      dO.push(oldOvr(nw) - oldOvr(old));
      shown.push(proOvr(a, save.player.role) - computeOvrFromAttributes(a, save.player.role));
    }
  }
  console.log(`heróis: 240 × 3 estágios de treino`);
  console.log(`5 números (motor): ${deltaLine(dL)}`);
  console.log(`OVR legado (motor): ${deltaLine(dO)}`);
  console.log(`OVR exibido do herói (cálculo dos 28): ${deltaLine(shown)}`);
}

// ── 5. Evolução ─────────────────────────────────────────────────────────────
section('5. Evolução — 12 splits (4 anos), sem foco/estrutura, rodagem normal');
{
  const phase = (age: number) => (age <= 21 ? 'rising' : age <= 27 ? 'prime' : 'declining');
  const evoDelta = (pid: string, split: number, age: number, atCeiling: boolean): number => {
    const r = hashStr(`evo:${pid}:${split}`) % 100;
    if (phase(age) === 'rising') { if (atCeiling) return r < 70 ? 0 : 1; return r < 40 ? 3 : r < 80 ? 2 : 1; }
    if (phase(age) === 'prime') return r < 22 ? 1 : r < 82 ? 0 : -1;
    const declineFrom = 31 + Math.floor((hashStr(`long:${pid}`) % 100) / 20);
    if (age < declineFrom) return r < 82 ? 0 : -1;
    const over = age - declineFrom;
    if (over === 0) return r < 50 ? 0 : -1;
    if (over <= 2) return r < 55 ? -1 : 0;
    return r < 55 ? -2 : -1;
  };
  const players: (Player & { age?: number })[] = CS2_REAL_2026.flatMap((t) => t.players);
  for (let i = 0; i < 200; i++) {
    const b = 60 + (i % 20);
    players.push({ id: `syn${i}`, nick: `syn${i}`, name: '', country: 'br', role: (['AWP', 'IGL', 'Rifler', 'Entry', 'Support', 'Lurker'] as Role[])[i % 6], aim: b + 2, consistency: b, clutch: b - 1, awp: i % 6 === 0 ? b + 3 : b - 15, igl: i % 6 === 1 ? b + 3 : b - 12, age: 16 + (i % 5) });
  }
  const buckets: Record<string, { old: number[]; nw: number[] }> = {};
  for (const p of players) {
    const age0 = p.age ?? (ages as Record<string, { age?: number }>)[p.nick]?.age ?? defaultAge(p.id);
    const base = playerOvr(p);
    const pot = potentialOvrFor(p.id, base, age0);
    let old = base;
    let x = attrsOf({ ...p, age: age0 });
    x = { ...x, pa: Math.max(x.ca, caFromOvr(pot)) };
    for (let s = 1; s <= 12; s++) {
      const age = age0 + Math.floor((s - 1) / 3);
      let dd = evoDelta(p.id, s, age, old >= pot);
      if (dd > 0) dd = Math.min(dd, Math.max(0, pot - old));
      old = Math.max(40, Math.min(99, old + dd));
      x = evolveAttrs(x, { playerId: p.id, split: s, age }).attrs;
    }
    const b = age0 <= 18 ? '16-18' : age0 <= 21 ? '19-21' : age0 <= 24 ? '22-24' : age0 <= 27 ? '25-27' : age0 <= 30 ? '28-30' : age0 <= 33 ? '31-33' : '34+';
    (buckets[b] ??= { old: [], nw: [] });
    buckets[b].old.push(old - base);
    buckets[b].nw.push(ovrFromAttrs(x) - base);
  }
  console.log('idade inicial |   n | ΔOVR antigo (média±dp) | ΔOVR novo (média±dp)');
  for (const b of ['16-18', '19-21', '22-24', '25-27', '28-30', '31-33', '34+']) {
    const v = buckets[b];
    if (!v) continue;
    console.log(`${b.padEnd(13)} | ${String(v.old.length).padStart(3)} | ${`${mean(v.old).toFixed(2)} ± ${sd(v.old).toFixed(2)}`.padStart(22)} | ${`${mean(v.nw).toFixed(2)} ± ${sd(v.nw).toFixed(2)}`.padStart(20)}`);
  }
}
