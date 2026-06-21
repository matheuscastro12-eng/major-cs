// Ranked Major — 2 a 8 managers disputam o mesmo Major; ranking por quem vai mais longe.
// Porta fiel do OnlineMajor.jsx. Vs IA (rtmResolve).
import { useState } from 'react';
import { Panel, Button } from '../ds';
import { Flag } from '../ui';
import { BackBar } from './bits';
import { QuickDraft } from './QuickDraft';
import { ONLINE_RIVALS, OPEN_ROOMS, REGION, resolve, majorPlace, type OnlineStats, type PoolPlayer, type OpenRoom, type PlaceKey } from './onlineData';
import type { Manager } from '../../state/manager';

const MJ_ROUNDS = [
  { key: 'swiss', label: 'Fase suíça', opp: 80 },
  { key: 'quarter', label: 'Quartas de final', opp: 84 },
  { key: 'semi', label: 'Semifinal', opp: 88 },
  { key: 'final', label: 'Grande final', opp: 91 },
] as const;

type Field = { nick: string; country: string; you?: boolean; mmr?: number };
type Round = { label: string; win: boolean; score: string };
type Standing = { nick: string; country: string; you?: boolean; reach: number; place: PlaceKey; pts: number };

export function OnlineMajor({ manager, pool, setStats, onHub, onExit }: {
  manager: Manager;
  pool: PoolPlayer[];
  stats: OnlineStats;
  setStats: (fn: (s: OnlineStats) => OnlineStats) => void;
  onHub: () => void;
  onExit: () => void;
}) {
  const me = manager;
  const [phase, setPhase] = useState<'browse' | 'setup' | 'draft' | 'run' | 'standings'>('browse');
  const [count, setCount] = useState(4);
  const [rooms, setRooms] = useState<OpenRoom[]>(() => OPEN_ROOMS.map((r) => ({ ...r })));
  const [room, setRoom] = useState<OpenRoom | null>(null);
  const [field, setField] = useState<Field[]>([]);
  const [myOvr, setMyOvr] = useState(0);
  const [roundIdx, setRoundIdx] = useState(0);
  const [history, setHistory] = useState<Round[]>([]);
  const [myPlace, setMyPlace] = useState<PlaceKey>('swiss');
  const [rolling, setRolling] = useState(false);
  const [standings, setStandings] = useState<Standing[]>([]);

  function buildField(n: number): Field[] {
    const bots = [...ONLINE_RIVALS].sort(() => Math.random() - 0.5).slice(0, n - 1).map((b) => ({ nick: b.nick, country: b.country, mmr: b.mmr }));
    return [{ nick: me.nick, country: me.country, you: true }, ...bots];
  }
  function startDraft() { setRoom(null); setField(buildField(count)); setPhase('draft'); }
  function joinRoom(r: OpenRoom) {
    const others = ONLINE_RIVALS.filter((b) => b.nick !== r.host.nick).sort(() => Math.random() - 0.5).slice(0, Math.max(0, r.size - 2)).map((b) => ({ nick: b.nick, country: b.country, mmr: b.mmr }));
    setRoom(r); setCount(r.size);
    setField([{ nick: me.nick, country: me.country, you: true }, { nick: r.host.nick, country: r.host.country, mmr: 2000 }, ...others]);
    setPhase('draft');
  }
  function refreshRooms() {
    setRooms(OPEN_ROOMS.map((r) => {
      if (r.status === 'full' || r.status === 'drafting') return { ...r };
      const j = Math.max(1, Math.min(r.size, r.joined + (Math.random() < 0.5 ? -1 : 1)));
      return { ...r, joined: j, status: j >= r.size ? 'full' : 'open' };
    }));
  }
  function onDrafted(_picked: PoolPlayer[], avg: number) { setMyOvr(avg); setRoundIdx(0); setHistory([]); setPhase('run'); }

  function playRound() {
    if (rolling) return;
    setRolling(true);
    const r = MJ_ROUNDS[roundIdx];
    window.setTimeout(() => {
      const res = resolve(myOvr, r.opp);
      const h = [...history, { label: r.label, win: res.win, score: res.score }];
      setHistory(h);
      setRolling(false);
      if (!res.win) finish(r.key, h);
      else if (roundIdx === MJ_ROUNDS.length - 1) finish('champion', h);
      else setRoundIdx(roundIdx + 1);
    }, 900);
  }

  function finish(placeKey: PlaceKey, _h: Round[]) {
    const reachOf: Record<string, number> = { swiss: 0, quarter: 1, semi: 2, final: 3, champion: 4 };
    const mine: Standing = { nick: me.nick, country: me.country, you: true, reach: reachOf[placeKey] + 0.5, place: 'swiss', pts: 0 };
    const bots: Standing[] = field.filter((f) => !f.you).map((b) => ({ nick: b.nick, country: b.country, reach: Math.max(0, Math.min(4, ((b.mmr ?? 1700) - 1600) / 170 + (Math.random() * 2.6 - 0.3))), place: 'swiss', pts: 0 }));
    const ranked = [...bots, mine].sort((a, b) => b.reach - a.reach);
    const byRank: PlaceKey[] = ['champion', 'final', 'semi', 'semi', 'quarter', 'quarter', 'quarter', 'quarter'];
    const all = ranked.map((r, i) => { const key = byRank[i] ?? 'swiss'; return { ...r, place: key, pts: majorPlace(key).pts }; });
    const myRow = all.find((r) => r.you)!;
    setMyPlace(myRow.place);
    setStandings(all);
    setStats((s) => ({ ...s, majorPts: s.majorPts + myRow.pts, gamesMajor: s.gamesMajor + 1 }));
    setPhase('standings');
  }

  if (phase === 'browse') {
    const openCount = rooms.filter((r) => r.status === 'open').length;
    const REGION_COLOR: Record<string, string> = { SA: 'var(--rtm-green-bright)', EU: 'var(--rtm-blue-bright)', NA: 'var(--rtm-gold)' };
    const statusMeta: Record<string, [string, string]> = { open: ['Aguardando', 'var(--rtm-green-bright)'], full: ['Cheia', 'var(--rtm-faint)'], drafting: ['Em draft', 'var(--rtm-gold)'] };
    return (
      <div style={{ maxWidth: '880px', margin: '0 auto' }}>
        <BackBar onHub={onHub} onExit={onExit} />
        <div style={{ textAlign: 'center', marginBottom: '18px' }}>
          <div style={{ fontSize: '34px' }}>🏆</div>
          <h1 style={{ margin: '6px 0 0', fontFamily: 'var(--font-cond)', fontSize: '32px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--rtm-text-strong)' }}>Ranked Major</h1>
          <p style={{ color: 'var(--rtm-dim)', fontSize: '14px', maxWidth: '500px', margin: '8px auto 0', lineHeight: 1.55 }}>Entre numa sala aberta ou crie a sua. Todos na mesma sala disputam o Major; o ranking é por quem chega mais longe.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--rtm-dim)' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--rtm-green-bright)', boxShadow: '0 0 8px var(--rtm-green-bright)' }} />
            <b style={{ color: 'var(--rtm-text-strong)' }}>{openCount} salas abertas</b> agora · {rooms.length} no total
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button size="sm" variant="ghost" onClick={refreshRooms}>⟳ Atualizar</Button>
            <Button size="sm" variant="gold" onClick={() => setPhase('setup')}>+ Criar sala</Button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {rooms.map((r) => {
            const [stLabel, stColor] = statusMeta[r.status];
            const canJoin = r.status === 'open';
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '13px 16px', borderRadius: '10px', background: 'var(--rtm-panel)', border: '1px solid var(--rtm-border-soft)', opacity: canJoin ? 1 : 0.7 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '74px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: stColor, boxShadow: canJoin ? '0 0 7px ' + stColor : 'none' }} />
                  <span style={{ fontSize: '11px', fontWeight: 700, color: stColor, textTransform: 'uppercase', letterSpacing: '.4px' }}>{stLabel}</span>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '17px', color: 'var(--rtm-text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--rtm-dim)' }}>host <Flag cc={r.host.country} /> <b style={{ color: 'var(--rtm-text)' }}>{r.host.nick}</b></div>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: REGION_COLOR[r.region], padding: '3px 9px', borderRadius: '999px', border: '1px solid var(--rtm-border)', whiteSpace: 'nowrap' }} title={REGION[r.region]}>{r.region} · {r.ping}ms</span>
                <div style={{ textAlign: 'center', minWidth: '64px' }}>
                  <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '18px', color: r.joined >= r.size ? 'var(--rtm-faint)' : 'var(--rtm-text-strong)', fontVariantNumeric: 'tabular-nums' }}>{r.joined}/{r.size}</div>
                  <div style={{ display: 'flex', gap: '2px', justifyContent: 'center', marginTop: '2px' }}>
                    {Array.from({ length: r.size }).map((_, i) => <span key={i} style={{ width: '7px', height: '7px', borderRadius: '2px', background: i < r.joined ? REGION_COLOR[r.region] : 'var(--rtm-panel-3)' }} />)}
                  </div>
                </div>
                <Button size="sm" variant={canJoin ? 'primary' : 'ghost'} disabled={!canJoin} onClick={() => joinRoom(r)}>{canJoin ? 'Entrar' : stLabel}</Button>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: '16px', textAlign: 'center' }}>
          <Button variant="gold" size="big" onClick={() => setPhase('setup')}>+ Criar minha sala</Button>
        </div>
      </div>
    );
  }

  if (phase === 'setup') {
    const preview: Field[] = [{ nick: me.nick, country: me.country, you: true }, ...ONLINE_RIVALS.slice(0, count - 1).map((b) => ({ nick: b.nick, country: b.country }))];
    return (
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
          <button type="button" onClick={() => setPhase('browse')} style={{ background: 'none', border: 'none', color: 'var(--rtm-link)', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>← Salas abertas</button>
          <button type="button" onClick={onExit} style={{ background: 'none', border: 'none', color: 'var(--rtm-faint)', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>Menu</button>
        </div>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '34px' }}>🏆</div>
          <h1 style={{ margin: '6px 0 0', fontFamily: 'var(--font-cond)', fontSize: '32px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--rtm-text-strong)' }}>Criar sala</h1>
          <p style={{ color: 'var(--rtm-dim)', fontSize: '14px', maxWidth: '480px', margin: '8px auto 0', lineHeight: 1.55 }}>Escolha o tamanho da sala. Cada manager monta o seu time e joga a própria campanha. No fim, o ranking é por quem foi mais longe.</p>
        </div>
        <Panel title="Quantos managers nesta sala?">
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
            {[2, 4, 6, 8].map((n) => (
              <button key={n} type="button" onClick={() => setCount(n)} style={{ cursor: 'pointer', width: '64px', height: '56px', borderRadius: '10px', fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '22px', border: `2px solid ${count === n ? 'var(--rtm-gold)' : 'var(--rtm-border)'}`, background: count === n ? 'rgba(216,169,67,.14)' : 'var(--rtm-bg-deep)', color: count === n ? 'var(--rtm-gold)' : 'var(--rtm-dim)' }}>{n}</button>
            ))}
          </div>
        </Panel>
        <div style={{ marginTop: '14px' }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.8px', color: 'var(--rtm-dim)', fontWeight: 700, marginBottom: '10px' }}>Managers na sala</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))', gap: '8px' }}>
            {preview.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderRadius: 'var(--rtm-radius)', background: p.you ? 'rgba(216,169,67,.1)' : 'var(--rtm-panel)', border: `1px solid ${p.you ? 'var(--rtm-gold-soft)' : 'var(--rtm-border-soft)'}` }}>
                <Flag cc={p.country} />
                <b style={{ fontFamily: 'var(--font-cond)', fontSize: '14px', color: p.you ? 'var(--rtm-gold)' : 'var(--rtm-text-strong)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nick}</b>
                {p.you && <span style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--rtm-gold)' }}>Você</span>}
              </div>
            ))}
          </div>
        </div>
        <Button variant="gold" size="big" style={{ width: '100%', marginTop: '20px' }} onClick={startDraft}>Montar meu time →</Button>
      </div>
    );
  }

  if (phase === 'draft') return <QuickDraft pool={pool} count={5} title="Monte seu time para o Major" subtitle="Escolha 5 lendas. O OVR médio define suas chances em cada rodada." accent="var(--rtm-gold)" onBack={() => setPhase(room ? 'browse' : 'setup')} onDone={onDrafted} />;

  if (phase === 'run') {
    const r = MJ_ROUNDS[roundIdx];
    return (
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <BackBar onHub={onHub} onExit={onExit} />
        <div style={{ textAlign: 'center', marginBottom: '18px' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.4px', color: 'var(--rtm-gold)', fontWeight: 800 }}>Sua campanha · time {myOvr} OVR</span>
          <h1 style={{ margin: '4px 0 0', fontFamily: 'var(--font-cond)', fontSize: '30px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--rtm-text-strong)' }}>{r.label}</h1>
          <p style={{ color: 'var(--rtm-dim)', fontSize: '13px', marginTop: '4px' }}>Adversário do nível {r.opp} OVR. Vença para avançar.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
          {MJ_ROUNDS.map((rd, i) => {
            const done = history[i]; const current = i === roundIdx && !done;
            return (
              <div key={rd.key} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: 'var(--rtm-radius)', background: current ? 'rgba(216,169,67,.1)' : 'var(--rtm-panel)', border: `1px solid ${current ? 'var(--rtm-gold-soft)' : 'var(--rtm-border-soft)'}`, opacity: !done && !current && i > roundIdx ? 0.5 : 1 }}>
                <span style={{ width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px', fontFamily: 'var(--font-cond)', background: done ? (done.win ? 'var(--rtm-green-bright)' : 'var(--rtm-red)') : current ? 'var(--rtm-gold)' : 'var(--rtm-panel-3)', color: done || current ? '#06121d' : 'var(--rtm-faint)' }}>{done ? (done.win ? '✓' : '✕') : i + 1}</span>
                <b style={{ flex: 1, fontFamily: 'var(--font-cond)', fontSize: '16px', color: 'var(--rtm-text-strong)' }}>{rd.label}</b>
                {done && <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: done.win ? 'var(--rtm-green-bright)' : 'var(--rtm-red-bright)' }}>{done.score}</span>}
                {current && <span style={{ fontSize: '11px', color: 'var(--rtm-gold)', fontWeight: 700, textTransform: 'uppercase' }}>Agora</span>}
              </div>
            );
          })}
        </div>
        <Button variant="gold" size="big" style={{ width: '100%' }} disabled={rolling} onClick={playRound}>{rolling ? 'Jogando…' : `Jogar ${r.label}`}</Button>
      </div>
    );
  }

  const pl = majorPlace(myPlace);
  return (
    <div style={{ maxWidth: '640px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.4px', color: 'var(--rtm-dim)', fontWeight: 800 }}>Sua colocação</span>
        <h1 style={{ margin: '4px 0 0', fontFamily: 'var(--font-cond)', fontSize: '52px', fontWeight: 800, textTransform: 'uppercase', color: pl.color, lineHeight: 1, textShadow: `0 0 36px ${pl.color}55` }}>{pl.label}</h1>
        <div style={{ fontSize: '15px', color: 'var(--rtm-gold)', fontWeight: 700, marginTop: '8px' }}>+{pl.pts} pontos de ranking</div>
      </div>
      <Panel title="Classificação final da sala" flush>
        {standings.map((s, i) => {
          const p = majorPlace(s.place);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', background: s.you ? 'rgba(216,169,67,.1)' : (i % 2 ? 'var(--rtm-row-b)' : 'var(--rtm-row-a)'), boxShadow: s.you ? 'inset 3px 0 0 var(--rtm-gold)' : 'none' }}>
              <span style={{ width: '28px', textAlign: 'center', fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '16px', color: i === 0 ? 'var(--rtm-gold)' : 'var(--rtm-faint)' }}>{i + 1}</span>
              <Flag cc={s.country} />
              <b style={{ flex: 1, fontFamily: 'var(--font-cond)', fontSize: '15px', color: s.you ? 'var(--rtm-gold)' : 'var(--rtm-text-strong)' }}>{s.nick}{s.you ? ' (você)' : ''}</b>
              <span style={{ fontSize: '12px', fontWeight: 700, color: p.color }}>{p.label}</span>
              <span style={{ width: '54px', textAlign: 'right', fontFamily: 'var(--font-cond)', fontWeight: 800, color: 'var(--rtm-text-strong)', fontVariantNumeric: 'tabular-nums' }}>{s.pts}</span>
            </div>
          );
        })}
      </Panel>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '22px' }}>
        <Button variant="gold" onClick={() => setPhase('browse')}>Jogar outro Major</Button>
        <Button variant="ghost" onClick={onHub}>Voltar ao hub</Button>
      </div>
    </div>
  );
}
