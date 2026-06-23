// Ranked Major — você + adversários (IA) disputam o mesmo Major; ranking por quem vai
// mais longe. Sem salas fake: você cria a sua (escolhe o tamanho) e joga vs IA.
import { useState } from 'react';
import { Panel, Button } from '../ds';
import { Flag } from '../ui';
import { BackBar } from './bits';
import { QuickDraft } from './QuickDraft';
import { resolve, majorPlace, type OnlineStats, type PoolPlayer, type PlaceKey } from './onlineData';
import type { Manager } from '../../state/manager';
import { ct } from '../../state/career-i18n';

const MJ_ROUNDS = [
  { key: 'swiss', label: 'Fase suíça', opp: 80 },
  { key: 'quarter', label: 'Quartas de final', opp: 84 },
  { key: 'semi', label: 'Semifinal', opp: 88 },
  { key: 'final', label: 'Grande final', opp: 91 },
] as const;
const OPP_CC = ['br', 'us', 'se', 'dk', 'ua', 'fr', 'de', 'pt', 'no', 'fi'];

type Field = { nick: string; country: string; you?: boolean };
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
  const [phase, setPhase] = useState<'setup' | 'draft' | 'run' | 'standings'>('setup');
  const [count, setCount] = useState(4);
  const [field, setField] = useState<Field[]>([]);
  const [myOvr, setMyOvr] = useState(0);
  const [roundIdx, setRoundIdx] = useState(0);
  const [history, setHistory] = useState<Round[]>([]);
  const [myPlace, setMyPlace] = useState<PlaceKey>('swiss');
  const [rolling, setRolling] = useState(false);
  const [standings, setStandings] = useState<Standing[]>([]);

  function buildField(n: number): Field[] {
    return [{ nick: me.nick, country: me.country, you: true }, ...Array.from({ length: n - 1 }, (_, i) => ({ nick: `${ct('Adversário')} ${i + 1}`, country: OPP_CC[i % OPP_CC.length] }))];
  }
  function startDraft() { setField(buildField(count)); setPhase('draft'); }
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
      if (!res.win) finish(r.key);
      else if (roundIdx === MJ_ROUNDS.length - 1) finish('champion');
      else setRoundIdx(roundIdx + 1);
    }, 900);
  }

  function finish(placeKey: PlaceKey) {
    const reachOf: Record<string, number> = { swiss: 0, quarter: 1, semi: 2, final: 3, champion: 4 };
    const mine: Standing = { nick: me.nick, country: me.country, you: true, reach: reachOf[placeKey] + 0.5, place: 'swiss', pts: 0 };
    const bots: Standing[] = field.filter((f) => !f.you).map((b) => ({ nick: b.nick, country: b.country, reach: Math.random() * 4, place: 'swiss', pts: 0 }));
    const ranked = [...bots, mine].sort((a, b) => b.reach - a.reach);
    const byRank: PlaceKey[] = ['champion', 'final', 'semi', 'semi', 'quarter', 'quarter', 'quarter', 'quarter'];
    const all = ranked.map((r, i) => { const key = byRank[i] ?? 'swiss'; return { ...r, place: key, pts: majorPlace(key).pts }; });
    const myRow = all.find((r) => r.you)!;
    setMyPlace(myRow.place);
    setStandings(all);
    setStats((s) => ({ ...s, majorPts: s.majorPts + myRow.pts, gamesMajor: s.gamesMajor + 1 }));
    setPhase('standings');
  }

  if (phase === 'setup') {
    const preview = buildField(count);
    return (
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <BackBar onHub={onHub} onExit={onExit} />
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '34px' }}>🏆</div>
          <h1 style={{ margin: '6px 0 0', fontFamily: 'var(--font-cond)', fontSize: '32px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--rtm-text-strong)' }}>{ct('Ranked Major')}</h1>
          <p style={{ color: 'var(--rtm-dim)', fontSize: '14px', maxWidth: '480px', margin: '8px auto 0', lineHeight: 1.55 }}>{ct('Escolha o tamanho da chave. Cada manager monta o seu time e joga a própria campanha. No fim, o ranking é por quem foi mais longe.')}</p>
        </div>
        <Panel title={ct('Quantos managers nesta chave?')}>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
            {[2, 4, 6, 8].map((n) => (
              <button key={n} type="button" onClick={() => setCount(n)} style={{ cursor: 'pointer', width: '64px', height: '56px', borderRadius: '10px', fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '22px', border: `2px solid ${count === n ? 'var(--rtm-gold)' : 'var(--rtm-border)'}`, background: count === n ? 'rgba(216,169,67,.14)' : 'var(--rtm-bg-deep)', color: count === n ? 'var(--rtm-gold)' : 'var(--rtm-dim)' }}>{n}</button>
            ))}
          </div>
        </Panel>
        <div style={{ marginTop: '14px' }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.8px', color: 'var(--rtm-dim)', fontWeight: 700, marginBottom: '10px' }}>{ct('Managers na chave')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))', gap: '8px' }}>
            {preview.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderRadius: 'var(--rtm-radius)', background: p.you ? 'rgba(216,169,67,.1)' : 'var(--rtm-panel)', border: `1px solid ${p.you ? 'var(--rtm-gold-soft)' : 'var(--rtm-border-soft)'}` }}>
                <Flag cc={p.country} />
                <b style={{ fontFamily: 'var(--font-cond)', fontSize: '14px', color: p.you ? 'var(--rtm-gold)' : 'var(--rtm-text-strong)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nick}</b>
                {p.you && <span style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--rtm-gold)' }}>{ct('Você')}</span>}
              </div>
            ))}
          </div>
        </div>
        <Button variant="gold" size="big" style={{ width: '100%', marginTop: '20px' }} onClick={startDraft}>{ct('Montar meu time →')}</Button>
      </div>
    );
  }

  if (phase === 'draft') return <QuickDraft pool={pool} count={5} title={ct('Monte seu time para o Major')} subtitle={ct('Escolha 5 lendas. O OVR médio define suas chances em cada rodada.')} accent="var(--rtm-gold)" onBack={() => setPhase('setup')} onDone={onDrafted} />;

  if (phase === 'run') {
    const r = MJ_ROUNDS[roundIdx];
    return (
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <BackBar onHub={onHub} onExit={onExit} />
        <div style={{ textAlign: 'center', marginBottom: '18px' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.4px', color: 'var(--rtm-gold)', fontWeight: 800 }}>{ct('Sua campanha · time')} {myOvr} OVR</span>
          <h1 style={{ margin: '4px 0 0', fontFamily: 'var(--font-cond)', fontSize: '30px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--rtm-text-strong)' }}>{ct(r.label)}</h1>
          <p style={{ color: 'var(--rtm-dim)', fontSize: '13px', marginTop: '4px' }}>{ct('Adversário do nível')} {r.opp} {ct('OVR. Vença para avançar.')}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
          {MJ_ROUNDS.map((rd, i) => {
            const done = history[i]; const current = i === roundIdx && !done;
            return (
              <div key={rd.key} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: 'var(--rtm-radius)', background: current ? 'rgba(216,169,67,.1)' : 'var(--rtm-panel)', border: `1px solid ${current ? 'var(--rtm-gold-soft)' : 'var(--rtm-border-soft)'}`, opacity: !done && !current && i > roundIdx ? 0.5 : 1 }}>
                <span style={{ width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px', fontFamily: 'var(--font-cond)', background: done ? (done.win ? 'var(--rtm-green-bright)' : 'var(--rtm-red)') : current ? 'var(--rtm-gold)' : 'var(--rtm-panel-3)', color: done || current ? '#06121d' : 'var(--rtm-faint)' }}>{done ? (done.win ? '✓' : '✕') : i + 1}</span>
                <b style={{ flex: 1, fontFamily: 'var(--font-cond)', fontSize: '16px', color: 'var(--rtm-text-strong)' }}>{ct(rd.label)}</b>
                {done && <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: done.win ? 'var(--rtm-green-bright)' : 'var(--rtm-red-bright)' }}>{done.score}</span>}
                {current && <span style={{ fontSize: '11px', color: 'var(--rtm-gold)', fontWeight: 700, textTransform: 'uppercase' }}>{ct('Agora')}</span>}
              </div>
            );
          })}
        </div>
        <Button variant="gold" size="big" style={{ width: '100%' }} disabled={rolling} onClick={playRound}>{rolling ? ct('Jogando…') : `${ct('Jogar')} ${ct(r.label)}`}</Button>
      </div>
    );
  }

  const pl = majorPlace(myPlace);
  return (
    <div style={{ maxWidth: '640px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.4px', color: 'var(--rtm-dim)', fontWeight: 800 }}>{ct('Sua colocação')}</span>
        <h1 style={{ margin: '4px 0 0', fontFamily: 'var(--font-cond)', fontSize: '52px', fontWeight: 800, textTransform: 'uppercase', color: pl.color, lineHeight: 1, textShadow: `0 0 36px ${pl.color}55` }}>{ct(pl.label)}</h1>
        <div style={{ fontSize: '15px', color: 'var(--rtm-gold)', fontWeight: 700, marginTop: '8px' }}>+{pl.pts} {ct('pontos de ranking')}</div>
      </div>
      <Panel title={ct('Classificação final da chave')} flush>
        {standings.map((s, i) => {
          const p = majorPlace(s.place);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', background: s.you ? 'rgba(216,169,67,.1)' : (i % 2 ? 'var(--rtm-row-b)' : 'var(--rtm-row-a)'), boxShadow: s.you ? 'inset 3px 0 0 var(--rtm-gold)' : 'none' }}>
              <span style={{ width: '28px', textAlign: 'center', fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '16px', color: i === 0 ? 'var(--rtm-gold)' : 'var(--rtm-faint)' }}>{i + 1}</span>
              <Flag cc={s.country} />
              <b style={{ flex: 1, fontFamily: 'var(--font-cond)', fontSize: '15px', color: s.you ? 'var(--rtm-gold)' : 'var(--rtm-text-strong)' }}>{s.nick}{s.you ? ` (${ct('você')})` : ''}</b>
              <span style={{ fontSize: '12px', fontWeight: 700, color: p.color }}>{ct(p.label)}</span>
              <span style={{ width: '54px', textAlign: 'right', fontFamily: 'var(--font-cond)', fontWeight: 800, color: 'var(--rtm-text-strong)', fontVariantNumeric: 'tabular-nums' }}>{s.pts}</span>
            </div>
          );
        })}
      </Panel>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '22px' }}>
        <Button variant="gold" onClick={() => setPhase('setup')}>{ct('Jogar outro Major')}</Button>
        <Button variant="ghost" onClick={onHub}>{ct('Voltar ao hub')}</Button>
      </div>
    </div>
  );
}
