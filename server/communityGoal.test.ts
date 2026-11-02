// [URG-5] meta comunitária: elegibilidade do resgate, visões e idempotência do claim (SQL falso em memória).
import assert from 'node:assert/strict';
import test from 'node:test';
import { claimEligibility, communityGoalClaim, ensureCommunityWeek, bumpCommunityContrib, mineView, resolveWeekTarget, weekView } from './communityGoal.js';
import { communityGoalFor } from '../src/engine/ultimate/communityGoal.js';
import type { SqlTag } from './ultimate-economy.js';

const MON = Date.UTC(2026, 8, 14); // segunda, semana ISO 38
const goal = communityGoalFor(MON, 1000); // alvo 1150

test('elegibilidade: só com a semana fechada OU a meta batida, 3+ partidas e sem claim anterior', () => {
  const base = { now: MON + 86_400_000, goal, total: 100, matches: 5, claimed: false };
  assert.deepEqual(claimEligibility(base), { ok: false, reason: 'in_progress' });
  assert.deepEqual(claimEligibility({ ...base, total: 1150 }), { ok: true, credits: 5000, packTier: null });
  assert.deepEqual(claimEligibility({ ...base, total: 1150, matches: 10 }), { ok: true, credits: 5000, packTier: 'gold' });
  assert.deepEqual(claimEligibility({ ...base, now: goal.endsAt + 1 }), { ok: true, credits: 5000, packTier: null }); // fechou sem bater: quem jogou ganha mesmo assim
  assert.deepEqual(claimEligibility({ ...base, total: 1150, matches: 2 }), { ok: false, reason: 'too_few_matches' });
  assert.deepEqual(claimEligibility({ ...base, total: 1150, claimed: true }), { ok: false, reason: 'already_claimed' });
});

test('visões: progresso/restante/fechada e a minha contribuição', () => {
  const w = weekView(goal, 575, MON);
  assert.equal(w.pct, 50); assert.equal(w.remaining, 575); assert.equal(w.reached, false); assert.equal(w.closed, false);
  assert.equal(weekView(goal, 1200, goal.endsAt + 1).closed, true);
  assert.deepEqual(mineView(goal, 1200, MON, { matches: 12, claimed: false }), { myMatches: 12, claimed: false, claimable: true, credits: 5000, packTier: 'gold' });
  assert.deepEqual(mineView(goal, 100, MON, null), { myMatches: 0, claimed: false, claimable: false, credits: 0, packTier: null });
  assert.equal(resolveWeekTarget(1000), 1150);
});

// SQL falso: guarda as duas tabelas em memória e responde pelo texto da query.
function fakeSql() {
  const goals = new Map<string, { target: number; total: number }>();
  const contrib = new Map<string, { matches: number; claimed: boolean }>();
  const sql = ((strings: TemplateStringsArray, ...p: unknown[]) => {
    const q = strings.join('?').replace(/\s+/g, ' ');
    const run = (): Record<string, unknown>[] => {
      if (q.startsWith('SELECT target, total FROM rtm_community_goal')) { const g = goals.get(String(p[0])); return g ? [{ ...g }] : []; }
      if (q.startsWith('SELECT total FROM rtm_community_goal')) { const g = goals.get(String(p[0])); return g ? [{ total: g.total }] : []; }
      if (q.startsWith('INSERT INTO rtm_community_goal')) { if (goals.has(String(p[0]))) return []; goals.set(String(p[0]), { target: Number(p[1]), total: 0 }); return [{ target: p[1] }]; }
      if (q.startsWith('UPDATE rtm_community_goal SET total')) { const g = goals.get(String(p[0])); if (g) g.total += 1; return []; }
      if (q.startsWith('INSERT INTO rtm_community_contrib')) { const k = `${p[0]}|${p[1]}`; const c = contrib.get(k); if (c) c.matches += 1; else contrib.set(k, { matches: 1, claimed: false }); return []; }
      if (q.startsWith('SELECT matches, claimed FROM rtm_community_contrib')) { const c = contrib.get(`${p[0]}|${p[1]}`); return c ? [{ ...c }] : []; }
      if (q.startsWith('UPDATE rtm_community_contrib SET claimed=true')) { const c = contrib.get(`${p[0]}|${p[1]}`); if (!c || c.claimed) return []; c.claimed = true; return [{ matches: c.matches }]; }
      throw new Error(`query não prevista: ${q}`);
    };
    return Promise.resolve(run());
  }) as unknown as SqlTag;
  return { sql, goals, contrib };
}

test('semana nasce com alvo escalado pela anterior; contribuições somam; claim paga UMA vez', async () => {
  const { sql, goals, contrib } = fakeSql();
  goals.set('cg-2026-37', { target: 300, total: 1000 });
  const first = await ensureCommunityWeek(sql, MON);
  assert.equal(first.goal.id, 'cg-2026-38'); assert.equal(first.goal.target, 1150);
  for (let i = 0; i < 3; i++) await bumpCommunityContrib(sql, MON + i, 'a@x.com');
  await bumpCommunityContrib(sql, MON, 'b@x.com');
  assert.equal(goals.get('cg-2026-38')?.total, 4);
  assert.equal(contrib.get('cg-2026-38|a@x.com')?.matches, 3);
  // em andamento: não resgata
  assert.deepEqual(await communityGoalClaim(sql, MON + 1, 'a@x.com', 'cg-2026-38'), { ok: false, error: 'in_progress' });
  // semana fechou: 'a' (3 partidas) resgata 5.000; replay devolve ok sem prêmio; 'b' (1 partida) não
  const after = first.goal.endsAt + 1000;
  assert.deepEqual(await communityGoalClaim(sql, after, 'a@x.com', 'cg-2026-38'), { ok: true, credits: 5000, packTier: null, replayed: false, weekId: 'cg-2026-38' });
  assert.deepEqual(await communityGoalClaim(sql, after, 'a@x.com', 'cg-2026-38'), { ok: true, credits: 0, packTier: null, replayed: true, weekId: 'cg-2026-38' });
  assert.deepEqual(await communityGoalClaim(sql, after, 'b@x.com', 'cg-2026-38'), { ok: false, error: 'too_few_matches' });
  // semana que não existe no banco
  assert.deepEqual(await communityGoalClaim(sql, after, 'a@x.com', 'cg-2026-39'), { ok: false, error: 'unknown_week' });
});

test('bump nunca derruba o report que o chamou (SQL quebrado é engolido)', async () => {
  const broken = (() => Promise.reject(new Error('neon caiu'))) as unknown as SqlTag;
  await assert.doesNotReject(() => bumpCommunityContrib(broken, MON, 'a@x.com'));
});
