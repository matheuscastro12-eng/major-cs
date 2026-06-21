// Ranked 1v1 — matchmaking → snake draft → resultado (MMR). Porta do Ranked1v1.jsx.
// Nesta fase a partida é resolvida por força de time; veto/match completos vêm depois.
import { useEffect, useRef, useState } from 'react';
import { Panel, Button } from '../ds';
import { Flag, OvrBadge, PlayerAvatar } from '../ui';
import { RoleTag } from './bits';
import { ONLINE_RIVALS, rankFor, resolve, type OnlineStats, type PoolPlayer, type Rival } from './onlineData';
import type { Manager } from '../../state/manager';

const ORDER = ['me', 'rival', 'rival', 'me', 'me', 'rival', 'rival', 'me', 'me', 'rival'] as const;

export function Ranked1v1({ manager, pool, stats, setStats, onReport, onHub, onExit }: {
  manager: Manager;
  pool: PoolPlayer[];
  stats: OnlineStats;
  setStats: (fn: (s: OnlineStats) => OnlineStats) => void;
  onReport?: (won: boolean) => void;
  onHub: () => void;
  onExit: () => void;
}) {
  const me = manager;
  const mmr = stats.mmr;
  const [phase, setPhase] = useState<'lobby' | 'search' | 'draft' | 'result'>('lobby');
  const [rival, setRival] = useState<Rival | null>(null);
  const [dots, setDots] = useState(0);
  const [outcome, setOutcome] = useState<{ won: boolean; delta: number } | null>(null);

  const poolRef = useRef<PoolPlayer[] | null>(null);
  if (!poolRef.current) poolRef.current = pool.slice(0, 18);
  const [taken, setTaken] = useState<Record<string, 'me' | 'rival'>>({});
  const [pickN, setPickN] = useState(0);
  const myCount = Object.values(taken).filter((x) => x === 'me').length;
  const rivalCount = Object.values(taken).filter((x) => x === 'rival').length;

  useEffect(() => {
    if (phase !== 'search') return;
    setDots(0);
    const di = window.setInterval(() => setDots((d) => (d + 1) % 4), 350);
    const done = window.setTimeout(() => {
      const near = ONLINE_RIVALS.filter((r) => Math.abs(r.mmr - mmr) < 220);
      const list = near.length ? near : ONLINE_RIVALS;
      setRival(list[Math.floor(Math.random() * list.length)]);
      setPhase('draft'); setTaken({}); setPickN(0);
    }, 2400);
    return () => { window.clearInterval(di); window.clearTimeout(done); };
  }, [phase, mmr]);

  useEffect(() => {
    if (phase !== 'draft') return;
    if (pickN >= ORDER.length) {
      const t = window.setTimeout(() => settle(), 700);
      return () => window.clearTimeout(t);
    }
    if (ORDER[pickN] === 'rival') {
      const t = window.setTimeout(() => {
        const avail = poolRef.current!.filter((p) => !taken[p.nick]);
        const choice = avail[Math.floor(Math.random() * Math.min(3, avail.length))];
        if (choice) { setTaken((tk) => ({ ...tk, [choice.nick]: 'rival' })); setPickN((n) => n + 1); }
      }, 700);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pickN, taken]);

  function settle() {
    const picks = poolRef.current!;
    const myAvg = avg(picks.filter((p) => taken[p.nick] === 'me'));
    const rivalAvg = avg(picks.filter((p) => taken[p.nick] === 'rival'));
    const res = resolve(myAvg, rivalAvg);
    const delta = res.win ? 25 : -22;
    setOutcome({ won: res.win, delta });
    setStats((s) => ({ ...s, mmr: Math.max(0, s.mmr + delta), w: s.w + (res.win ? 1 : 0), l: s.l + (res.win ? 0 : 1) }));
    onReport?.(res.win);
    setPhase('result');
  }
  const avg = (ps: PoolPlayer[]) => (ps.length ? Math.round(ps.reduce((a, p) => a + p.ovr, 0) / ps.length) : 75);

  function myPick(p: PoolPlayer) {
    if (ORDER[pickN] !== 'me' || taken[p.nick]) return;
    setTaken((t) => ({ ...t, [p.nick]: 'me' })); setPickN((n) => n + 1);
  }

  const rk = rankFor(mmr);
  const bar = (back?: () => void) => (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
      {back && <button type="button" onClick={back} style={{ background: 'none', border: 'none', color: 'var(--rtm-link)', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>← Hub online</button>}
      <button type="button" onClick={onExit} style={{ background: 'none', border: 'none', color: 'var(--rtm-faint)', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>Menu</button>
    </div>
  );

  if (phase === 'lobby') {
    return (
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        {bar(onHub)}
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '12px', border: '1px solid var(--rtm-border)', padding: '28px 26px', marginBottom: '16px' }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/maps/dust2.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.24 }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(13,17,22,.92), rgba(13,17,22,.6))' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
            <span style={{ width: '64px', height: '64px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '22px', color: '#fff', background: `linear-gradient(160deg, ${me.accent || '#4382b6'}, #20303f)` }}>{me.nick.slice(0, 2).toUpperCase()}</span>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <div style={{ fontSize: '11px', letterSpacing: '1.4px', textTransform: 'uppercase', color: rk.color, fontWeight: 800 }}>{rk.name}</div>
              <h1 style={{ margin: '2px 0', fontFamily: 'var(--font-cond)', fontSize: '28px', fontWeight: 800, color: 'var(--rtm-text-strong)' }}>{me.nick}</h1>
              <div style={{ fontSize: '13px', color: 'var(--rtm-dim)', display: 'flex', alignItems: 'center', gap: '8px' }}><Flag cc={me.country} /> {mmr} MMR</div>
            </div>
            <div style={{ textAlign: 'center', padding: '10px 18px', borderRadius: 'var(--rtm-radius)', background: 'rgba(18,22,27,.6)', border: '1px solid var(--rtm-border-soft)' }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--rtm-dim)', fontWeight: 700 }}>Temporada</div>
              <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '18px', color: 'var(--rtm-green-bright)' }}>{stats.w}W · {stats.l}L</div>
            </div>
          </div>
        </div>
        <Panel title="Ranked 1v1" accent="blue">
          <p style={{ margin: '0 0 16px', color: 'var(--rtm-dim)', fontSize: '14px', lineHeight: 1.5 }}>O matchmaking busca um rival perto do seu MMR. Vocês sorteiam cinco lendas em draft alternado e jogam uma melhor de três. Leia o board e escolha para contrapor o adversário.</p>
          <Button size="big" variant="primary" onClick={() => setPhase('search')} style={{ width: '100%' }}>🔍 Procurar partida</Button>
        </Panel>
      </div>
    );
  }

  if (phase === 'search') {
    return (
      <div style={{ maxWidth: '560px', margin: '60px auto 0', textAlign: 'center' }}>
        <div style={{ width: '80px', height: '80px', margin: '0 auto 20px', borderRadius: '50%', border: '3px solid var(--rtm-border)', borderTopColor: 'var(--rtm-blue-bright)', animation: 'rtmSpin 0.9s linear infinite' }} />
        <h1 style={{ fontFamily: 'var(--font-cond)', fontSize: '26px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--rtm-text-strong)', margin: 0 }}>Procurando rival{'.'.repeat(dots)}</h1>
        <p style={{ color: 'var(--rtm-dim)', marginTop: '8px' }}>Buscando perto de {mmr} MMR · {rk.name}</p>
        <Button variant="ghost" size="sm" onClick={() => setPhase('lobby')} style={{ marginTop: '18px' }}>Cancelar</Button>
        <style>{`@keyframes rtmSpin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (phase === 'result' && outcome) {
    const won = outcome.won;
    return (
      <div style={{ maxWidth: '560px', margin: '50px auto 0', textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: '64px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '4px', color: won ? 'var(--rtm-green-bright)' : 'var(--rtm-red-bright)', textShadow: `0 0 40px ${won ? 'rgba(111,208,111,.4)' : 'rgba(226,90,90,.4)'}` }}>{won ? 'Vitória' : 'Derrota'}</div>
        <div style={{ fontSize: '15px', color: 'var(--rtm-dim)', marginTop: '4px' }}>vs {rival ? rival.nick : 'rival'}</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '14px', margin: '24px auto 0', padding: '16px 28px', borderRadius: '10px', background: 'var(--rtm-panel)', border: '1px solid var(--rtm-border-soft)' }}>
          <div><div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--rtm-dim)', fontWeight: 700, letterSpacing: '.6px' }}>MMR</div><div style={{ fontFamily: 'var(--font-cond)', fontSize: '28px', fontWeight: 800, color: 'var(--rtm-text-strong)' }}>{stats.mmr}</div></div>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: '20px', fontWeight: 800, color: won ? 'var(--rtm-green-bright)' : 'var(--rtm-red-bright)' }}>{outcome.delta >= 0 ? '+' : ''}{outcome.delta}</div>
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '26px' }}>
          <Button variant="primary" onClick={() => { setOutcome(null); setPhase('search'); }}>Jogar de novo</Button>
          <Button variant="ghost" onClick={onHub}>Voltar ao hub</Button>
        </div>
      </div>
    );
  }

  // SNAKE DRAFT
  const turn = ORDER[pickN];
  const myTurn = turn === 'me';
  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
      {bar(() => setPhase('lobby'))}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '14px', padding: '14px 20px', borderRadius: '10px', background: 'linear-gradient(120deg, rgba(67,130,182,.16), rgba(13,17,22,.4))', border: '1px solid var(--rtm-border-soft)', marginBottom: '14px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ width: '38px', height: '38px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-cond)', fontWeight: 800, color: '#fff', background: `linear-gradient(160deg, ${me.accent || '#4382b6'}, #20303f)` }}>{me.nick.slice(0, 2).toUpperCase()}</span>
          <span><b style={{ color: 'var(--rtm-blue-bright)', fontFamily: 'var(--font-cond)', fontSize: '16px' }}>{me.nick}</b><div style={{ fontSize: '11px', color: 'var(--rtm-dim)' }}>{myCount}/5 escolhidos</div></span>
        </span>
        <span style={{ fontFamily: 'var(--font-cond)', fontWeight: 800, color: 'var(--rtm-gold)', fontSize: '18px' }}>DRAFT</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'flex-end' }}>
          <span style={{ textAlign: 'right' }}><b style={{ color: 'var(--rtm-gold)', fontFamily: 'var(--font-cond)', fontSize: '16px' }}>{rival ? rival.nick : 'rival'}</b><div style={{ fontSize: '11px', color: 'var(--rtm-dim)' }}>{rivalCount}/5 escolhidos</div></span>
          <span style={{ width: '38px', height: '38px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-cond)', fontWeight: 800, color: '#06121d', background: 'linear-gradient(160deg, var(--rtm-gold), var(--rtm-gold-soft))' }}>{rival ? rival.nick.slice(0, 2).toUpperCase() : '??'}</span>
        </span>
      </div>
      <div style={{ textAlign: 'center', marginBottom: '12px', fontFamily: 'var(--font-cond)', fontSize: '15px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: pickN >= ORDER.length ? 'var(--rtm-green-bright)' : myTurn ? 'var(--rtm-blue-bright)' : 'var(--rtm-gold)' }}>
        {pickN >= ORDER.length ? 'Draft completo — resolvendo…' : myTurn ? '● Sua escolha' : `${rival ? rival.nick : 'rival'} está escolhendo…`}
      </div>
      <div className="rtm-pcards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px', opacity: myTurn ? 1 : 0.75 }}>
        {poolRef.current!.map((p) => {
          const owner = taken[p.nick];
          return (
            <button key={p.nick} type="button" disabled={!!owner || !myTurn} onClick={() => myPick(p)} style={{ position: 'relative', textAlign: 'center', cursor: owner || !myTurn ? 'default' : 'pointer', background: owner === 'me' ? 'rgba(67,130,182,.16)' : owner === 'rival' ? 'rgba(216,169,67,.14)' : 'var(--rtm-panel-2)', border: `1px solid ${owner === 'me' ? 'var(--rtm-blue-bright)' : owner === 'rival' ? 'var(--rtm-gold-soft)' : 'var(--rtm-border-soft)'}`, borderRadius: 'var(--rtm-radius)', padding: '12px 8px', opacity: owner ? 0.6 : 1 }}>
              <OvrBadge ovr={p.ovr} />
              <PlayerAvatar nick={p.nick} size={44} />
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: '14px', fontWeight: 700, color: 'var(--rtm-text-strong)', marginTop: '6px' }}>{p.nick}</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '5px', marginTop: '4px' }}><Flag cc={p.country} /><RoleTag role={p.role} /></div>
              {owner && <div style={{ marginTop: '6px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: owner === 'me' ? 'var(--rtm-blue-bright)' : 'var(--rtm-gold)' }}>{owner === 'me' ? me.nick : (rival ? rival.nick : 'rival')}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
