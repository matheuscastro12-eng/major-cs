// Rota isolada /clutch (ou ?clutch=1), sem link no app. Monta uma config demo
// a partir de um time real de CS2_REAL_2026 e mostra o resultado no fim.
// Parâmetros: ?team=<id> &hp=1..100 &armor=0|1 &bots=1..5 &seed=n &time=s &fps=1
import { useCallback, useMemo, useState } from 'react';
import { CS2_REAL_2026 } from '../data/bo3';
import { attrsOf } from '../engine/attrs/model';
import { ClutchCanvas } from './ClutchCanvas';
import type { ClutchConfig, ClutchResult } from './types';

export function buildDemoConfig(search: string, seedOverride?: number): ClutchConfig {
  const sp = new URLSearchParams(search);
  const num = (k: string, d: number, lo: number, hi: number) => {
    const v = Number(sp.get(k));
    return sp.get(k) !== null && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
  };
  const pool = CS2_REAL_2026.filter((t) => !t.pending && !t.defunct && t.players.length >= 3);
  const team = pool.find((t) => t.id === sp.get('team')) ?? pool[0];
  const bots = Math.round(num('bots', 3, 1, 5));
  const players = [...team.players].sort((a, b) => b.aim + b.clutch - (a.aim + a.clutch)).slice(0, bots);
  return {
    map: 'nuke',
    scenario: 'postplant-B-1v3',
    opponents: players.map((p) => ({ id: p.id, name: p.nick, role: p.role, attrs: attrsOf(p) })),
    hp: Math.round(num('hp', 100, 1, 100)),
    armor: sp.get('armor') === '0' ? 0 : 100,
    weapons: { primary: sp.get('pistol') === '1' ? null : 'rifle', secondary: 'pistol' },
    bombTimeLeft: num('time', 40, 5, 40),
    seed: seedOverride ?? Math.round(num('seed', 1 + Math.floor(Math.random() * 1e6), 0, 2 ** 31)),
  };
}

export function ClutchRoute() {
  const search = window.location.search;
  const debugFps = new URLSearchParams(search).get('fps') === '1';
  const [round, setRound] = useState(0);
  const config = useMemo(() => {
    const c = buildDemoConfig(search);
    return round === 0 ? c : { ...c, seed: (c.seed ?? 1) + round };
  }, [search, round]);
  const onEnd = useCallback((r: ClutchResult) => {
    // exposto para QA/automação; quem integrar depois usa o callback
    (window as unknown as { __clutchResult?: ClutchResult }).__clutchResult = r;
  }, []);
  return (
    <ClutchCanvas
      key={round}
      config={config}
      onEnd={onEnd}
      debugFps={debugFps}
      onRetry={() => setRound((r) => r + 1)}
      onExit={() => { window.location.href = '/'; }}
    />
  );
}

export default ClutchRoute;
