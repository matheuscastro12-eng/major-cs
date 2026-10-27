// Draft: dados do card "meu time dos sonhos" + elencos 2026 sincronizados com a base bo3.gg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dreamTeamData, dreamXText } from '../src/state/dreamTeamCard.ts';
import type { DraftState, TeamSeason } from '../src/types.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const teams = JSON.parse(readFileSync(ROOT + 'src/data/teams.json', 'utf8')) as TeamSeason[];
const bo3 = JSON.parse(readFileSync(ROOT + 'src/data/bo3-2026.json', 'utf8')) as TeamSeason[];

function draftOf(ids: string[], coach?: string): DraftState {
  const rounds = ids.map((tid) => { const t = teams.find((x) => x.id === tid)!; return { teamSeasonId: tid, pickedPlayerId: t.players[0].id }; });
  return { mode: 'classic', teamName: 'Time Teste', rounds, current: 6, rerollsLeft: 0, coachOptions: [], pickedCoachTeamId: coach } as unknown as DraftState;
}

test('card: 5 picks, OVR médio, eras e coach', () => {
  const ids = ['navi2026', 'mouz2026', 'vitality2025', 'furia2025', '00nation2022'];
  const d = dreamTeamData(draftOf(ids, 'navi2026'), teams);
  assert.equal(d.picks.length, 5);
  assert.equal(d.coach?.nick, teams.find((t) => t.id === 'navi2026')!.coach.nick);
  assert.ok(d.avgOvr > 0 && d.avgOvr <= 99);
  assert.equal(d.eras, 3); // 2026, 2025, 2022
  const x = dreamXText(d);
  for (const p of d.picks) assert.ok(x.includes(p.nick));
});

test('card: ignora pick de time inexistente sem quebrar', () => {
  const dr = draftOf(['navi2026']);
  dr.rounds.push({ teamSeasonId: 'nao-existe', pickedPlayerId: 'x' } as DraftState['rounds'][number]);
  const d = dreamTeamData(dr, teams);
  assert.equal(d.picks.length, 1);
  assert.equal(d.teamName, 'Time Teste');
});

test('dados: NaVi 2026 e MOUZ 2026 batem com a base bo3.gg (set/2026)', () => {
  for (const [id, name] of [['navi2026', 'Natus Vincere'], ['mouz2026', 'MOUZ']]) {
    const a = teams.find((t) => t.id === id)!.players.map((p) => p.nick.toLowerCase()).sort();
    const b = bo3.find((t) => t.team === name)!.players.map((p) => p.nick.toLowerCase()).sort();
    assert.deepEqual(a, b, id);
    assert.equal(new Set(teams.find((t) => t.id === id)!.players.map((p) => p.id)).size, 5);
  }
});

test('teams.json legacy2026 = elenco 2026 do bo3.gg (try no lugar de saadzin, coach RiVAS)', async () => {
  const teams = (await import('../src/data/teams.json', { with: { type: 'json' } })).default as { id: string; coach: { nick: string }; players: { nick: string }[] }[];
  const l = teams.find((t) => t.id === 'legacy2026')!;
  assert.deepEqual(l.players.map((p) => p.nick).sort(), ['arT', 'dumau', 'latto', 'n1ssim', 'try'].sort());
  assert.equal(l.coach.nick, 'RiVAS');
});
